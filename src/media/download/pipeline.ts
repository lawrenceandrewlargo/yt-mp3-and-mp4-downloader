import { mkdir, readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import type { Config } from '../../config/env';
import type { DownloadRequest, Settings } from '../../lib/security';
import { within } from '../../lib/security';
import { AppError } from '../../lib/errors';
import type { MediaMetadata, Progress, JobStatus } from '../../types/media';
import { encoderNames } from '../diagnostics';
import { selectFormats, parseProgress, nativeAudioCodec } from '../formats';
import { MediaMetadataService } from '../metadata';
import type { MediaExecutionProvider } from '../execution/provider';
import { publishFile } from './storage';

export interface PipelineCallbacks { update: (status: JobStatus, progress: Progress) => void; metadata: (media: MediaMetadata) => Promise<void> }
export async function runDownload(config: Config, provider: MediaExecutionProvider, id: string, request: DownloadRequest, settings: Settings, signal: AbortSignal, callbacks: PipelineCallbacks) {
  if (config.cloud || provider.kind !== 'local') throw new AppError('CLOUD_PROCESSING', 'Local media processing is required for downloads.', 503);
  const workspace = within(config.tempRoot, id);
  await mkdir(config.tempRoot, { recursive: true });
  await mkdir(workspace); // Exclusive ownership: do not reuse or delete an existing directory.
  try {
    callbacks.update('analyzing', { stage: 'Fetching metadata' });
    const media = await new MediaMetadataService(provider).analyze(request.url, signal);
    await callbacks.metadata(media);
    const plan = selectFormats(media, request);
    callbacks.update('downloading', { stage: 'Preparing download' });
    let sourcePath: string | undefined;
    const args = ['--no-playlist', '--no-simulate', '--format', plan.selector, '--paths', workspace, '--output', 'source.%(ext)s',
      '--newline', '--progress', '--progress-delta', '0.5', '--progress-template', 'download:PROGRESS:%(progress)j', '--progress-template', 'postprocess:POST:%(progress.postprocessor)s:%(progress.status)s', '--print', 'after_move:FILE:%(filepath)j'];
    if (request.type === 'video') args.push('--merge-output-format', request.format);
    // yt-dlp interprets this option as a filesystem path, not a PATH command.
    // With the default 'ffmpeg', leave discovery to its inherited PATH.
    if (path.isAbsolute(config.FFMPEG_PATH)) args.push('--ffmpeg-location', config.FFMPEG_PATH);
    const embedCover = settings.embedThumbnail && request.type === 'audio' && ['mp3', 'm4a', 'flac'].includes(request.format);
    if (embedCover) args.push('--write-thumbnail', '--convert-thumbnails', 'jpg');
    args.push('--', media.url);
    await provider.ytdlp(args, { signal, timeoutMs: config.timeoutMs, cwd: workspace, capture: false, onLine: line => {
      const progress = parseProgress(line);
      if (progress) callbacks.update('downloading', { ...progress, stage: plan.selector.includes('+') ? 'Downloading video / audio streams' : 'Downloading media' });
      if (line.startsWith('POST:')) callbacks.update(line.includes('Merger') ? 'merging' : 'processing', { stage: line.includes('Merger') ? 'Merging streams' : 'Preparing media' });
      if (line.startsWith('FILE:')) sourcePath = within(workspace, JSON.parse(line.slice(5)) as string);
    } });
    signal.throwIfAborted();
    if (!sourcePath || !(await stat(sourcePath)).isFile()) throw new AppError('OUTPUT', 'The downloader did not produce a media file.', 422);
    const output = within(workspace, `output.${request.format}`);
    const ffArgs = ['-y', '-i', sourcePath];
    let cover: string | undefined;
    if (embedCover) cover = (await readdir(workspace)).find(file => file.endsWith('.jpg'));
    if (cover) ffArgs.push('-i', within(workspace, cover));
    if (request.type === 'audio') {
      const native = request.bitrate === 'auto' && nativeAudioCodec(plan.source.audioCodec, request.format);
      callbacks.update(native ? 'processing' : 'converting', { stage: native ? 'Remuxing audio without re-encoding' : 'Converting audio' });
      ffArgs.push('-map', '0:a:0', '-c:a', native ? 'copy' : encoderNames[request.format as keyof typeof encoderNames]);
      if (!native && !['flac','wav'].includes(request.format) && request.bitrate !== 'auto') ffArgs.push('-b:a', `${request.bitrate}k`);
      if (!native && request.bitrate === 'auto' && request.format === 'mp3') ffArgs.push('-q:a', '2');
      if (cover) ffArgs.push('-map', '1:v:0', '-c:v', 'mjpeg', '-disposition:v:0', 'attached_pic'); else ffArgs.push('-vn');
      if (request.format === 'mp3') ffArgs.push('-id3v2_version', '3');
    } else {
      callbacks.update('processing', { stage: 'Remuxing video without re-encoding' });
      ffArgs.push('-map', '0:v:0', '-map', '0:a?', '-c', 'copy');
    }
    if (settings.embedMetadata) ffArgs.push('-metadata', `title=${media.title}`, '-metadata', `artist=${media.uploader}`, '-metadata', `comment=${media.url}`);
    else ffArgs.push('-map_metadata', '-1');
    if (request.format === 'mp4' || request.format === 'm4a') ffArgs.push('-movflags', '+faststart');
    ffArgs.push(output);
    await provider.ffmpeg(ffArgs, { signal, timeoutMs: config.timeoutMs, cwd: workspace });
    callbacks.update('processing', { stage: 'Verifying output streams' });
    const probe = JSON.parse(await provider.ffprobe(['-v', 'error', '-show_streams', '-show_format', '-of', 'json', output], { signal, timeoutMs: 15000 })) as { streams: {codec_type:string}[] };
    if (plan.hasAudio && !probe.streams.some(s => s.codec_type === 'audio')) throw new AppError('AUDIO_MISSING', 'Output verification found no audio stream.', 422);
    if (request.type === 'video' && !probe.streams.some(s => s.codec_type === 'video')) throw new AppError('VIDEO_MISSING', 'Output verification found no video stream.', 422);
    signal.throwIfAborted();
    const title = settings.naming === 'uploader-title' ? `${media.uploader} - ${media.title}` : media.title;
    return await publishFile(output, config.downloadRoot, request.type, title, request.format, settings.existing);
  } finally {
    // Workspace is a UUID-owned directory, never a user-supplied path.
    await rm(workspace, { recursive: true, force: true });
  }
}

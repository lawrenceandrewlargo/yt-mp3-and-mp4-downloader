import type { DownloadRequest } from '../lib/security';
import { AppError } from '../lib/errors';
import type { MediaFormat, MediaMetadata } from '../types/media';

export function compatibleVideo(f: MediaFormat, container: string) {
  if (f.videoCodec === 'none') return false;
  if (container === 'webm') return /^(vp8|vp9|vp0?9|av01)/i.test(f.videoCodec) && (f.audioCodec === 'none' || /^(opus|vorbis)/i.test(f.audioCodec));
  if (container === 'mp4') return /^(avc|h264|hev|h265|av01|mpeg4)/i.test(f.videoCodec) && (f.audioCodec === 'none' || /^(mp4a|aac|mp3)/i.test(f.audioCodec));
  return true;
}
export function resolutions(media: MediaMetadata, container: string) {
  const canMergeAudio = media.formats.some(f => f.videoCodec === 'none' && audioCompatible(f.audioCodec, container));
  return [...new Set(media.formats.filter(f => compatibleVideo(f, container) && f.height && (f.audioCodec !== 'none' || canMergeAudio)).map(f => f.height as number))].sort((a,b) => b-a);
}
export function audioCompatible(codec: string, container: string) {
  return container === 'webm' ? /^(opus|vorbis)/i.test(codec) : container === 'mp4' ? /^(mp4a|aac|mp3)/i.test(codec) : codec !== 'none';
}
export function nativeAudioCodec(codec: string, format: string) {
  if (format === 'mp3') return /^mp3/i.test(codec);
  if (format === 'm4a' || format === 'aac') return /^(aac|mp4a)/i.test(codec);
  if (format === 'opus') return /^opus/i.test(codec);
  if (format === 'flac') return /^flac$/i.test(codec);
  return format === 'wav' && /^pcm_/i.test(codec);
}
export function selectFormats(media: MediaMetadata, request: DownloadRequest) {
  if (request.exactFormatId) {
    const exact = media.formats.find(f => f.id === request.exactFormatId);
    if (!exact) throw new AppError('FORMAT', 'This exact format is no longer available.');
    if (request.type === 'audio' && exact.audioCodec === 'none') throw new AppError('FORMAT', 'This exact format has no audio stream.');
    if (request.type === 'video' && !compatibleVideo(exact, request.format)) throw new AppError('FORMAT', 'This exact video codec cannot be copied into the chosen container.');
    return { selector: exact.id, source: exact, hasAudio: exact.audioCodec !== 'none', exact: true };
  }
  const audio = media.formats.filter(f => f.audioCodec !== 'none' && f.videoCodec === 'none').sort((a,b) => (b.audioBitrate ?? 0) - (a.audioBitrate ?? 0));
  if (request.type === 'audio') {
    const native = request.bitrate === 'auto' ? audio.find(f => nativeAudioCodec(f.audioCodec, request.format)) : undefined;
    const source = native || audio[0] || media.formats.find(f => f.audioCodec !== 'none');
    if (!source) throw new AppError('FORMAT', 'No downloadable audio stream is available.');
    return { selector: source.id, source, hasAudio: true, exact: false };
  }
  const companion = audio.find(f => audioCompatible(f.audioCodec, request.format));
  const video = media.formats.filter(f => compatibleVideo(f, request.format) && (f.audioCodec !== 'none' || companion) && (request.resolution === 'best' || f.height === request.resolution)).sort((a,b) => (b.height ?? 0) - (a.height ?? 0) || (b.fps ?? 0) - (a.fps ?? 0) || (b.videoBitrate ?? 0) - (a.videoBitrate ?? 0));
  const source = video[0];
  if (!source) throw new AppError('FORMAT', 'No source matches that resolution and container. Choose another container or analyze again.');
  if (source.audioCodec === 'none' && !companion) throw new AppError('FORMAT', 'No compatible audio stream can be merged into this container. Choose MKV.');
  return { selector: source.audioCodec === 'none' ? `${source.id}+${companion!.id}` : source.id, source, hasAudio: true, exact: false };
}
export function parseProgress(line: string) {
  if (!line.startsWith('PROGRESS:')) return null;
  try {
    const item = JSON.parse(line.slice(9)) as Record<string, unknown>;
    const finite = (key: string) => typeof item[key] === 'number' && Number.isFinite(item[key]) ? item[key] as number : undefined;
    const downloadedBytes = finite('downloaded_bytes'), totalBytes = finite('total_bytes') || finite('total_bytes_estimate');
    return { stage: 'Downloading media', downloadedBytes, totalBytes, speed: finite('speed'), eta: finite('eta'), percent: totalBytes && downloadedBytes !== undefined ? Math.min(100, downloadedBytes / totalBytes * 100) : undefined };
  } catch { return null; }
}

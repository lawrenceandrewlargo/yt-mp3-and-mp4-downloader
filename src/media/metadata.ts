import { z } from 'zod';
import type { MediaFormat, MediaMetadata, MediaSummary } from '../types/media';
import { currentVideoUrl, isPlaylist, validateMediaUrl } from '../lib/security';
import { AppError } from '../lib/errors';
import { executionProvider, type MediaExecutionProvider } from './execution/provider';

const rawFormat = z.object({ format_id: z.string(), ext: z.string().optional(), container: z.string().optional(), width: z.number().nullable().optional(), height: z.number().nullable().optional(), fps: z.number().nullable().optional(), vcodec: z.string().nullable().optional(), acodec: z.string().nullable().optional(), vbr: z.number().nullable().optional(), abr: z.number().nullable().optional(), filesize: z.number().nullable().optional(), filesize_approx: z.number().nullable().optional(), dynamic_range: z.string().nullable().optional(), format_note: z.string().nullable().optional(), has_drm: z.boolean().nullable().optional() });
const rawMedia = z.object({ id: z.union([z.string(), z.number()]).optional(), title: z.string().nullable().optional(), webpage_url: z.string().nullable().optional(), url: z.string().nullable().optional(), uploader: z.string().nullable().optional(), channel: z.string().nullable().optional(), duration: z.number().nullable().optional(), thumbnail: z.string().nullable().optional(), thumbnails: z.array(z.object({url:z.string()})).optional(), extractor_key: z.string().nullable().optional(), description: z.string().nullable().optional(), formats: z.array(rawFormat).optional() });
export function parseSummary(raw: unknown, fallbackUrl = ''): MediaSummary {
  const item = rawMedia.parse(raw);
  const candidate = item.webpage_url || item.url || fallbackUrl;
  const url = /^https:\/\//.test(candidate) ? candidate : `https://www.youtube.com/watch?v=${encodeURIComponent(String(item.id ?? candidate))}`;
  const thumb = item.thumbnail || item.thumbnails?.at(-1)?.url || null;
  return { id: String(item.id ?? url), url: validateMediaUrl(url), title: (item.title || 'Untitled media').slice(0, 500), uploader: (item.uploader || item.channel || 'Unknown uploader').slice(0, 200), duration: item.duration ?? null, thumbnail: thumb && /^https:\/\//.test(thumb) ? thumb : null, source: item.extractor_key || new URL(url).hostname };
}
export function parseMetadata(raw: unknown, url: string): MediaMetadata {
  const item = rawMedia.parse(raw);
  const formats: MediaFormat[] = (item.formats ?? []).filter(f => !f.has_drm && f.ext !== 'mhtml' && (f.vcodec !== 'none' || f.acodec !== 'none')).map(f => ({ id: f.format_id, ext: f.ext ?? '', container: f.container ?? f.ext ?? '', width: f.width ?? null, height: f.height ?? null, fps: f.fps ?? null, videoCodec: f.vcodec ?? 'none', audioCodec: f.acodec ?? 'none', videoBitrate: f.vbr ?? null, audioBitrate: f.abr ?? null, filesize: f.filesize ?? f.filesize_approx ?? null, estimated: !f.filesize && !!f.filesize_approx, dynamicRange: f.dynamic_range ?? null, note: f.format_note ?? '' }));
  return { ...parseSummary(raw, url), formats, playlistDetected: isPlaylist(url), analyzedAt: Date.now(), description: (item.description || '').slice(0, 3000) };
}
let busy = 0;
async function bounded<T>(operation: () => Promise<T>) {
  if (busy >= 2) throw new AppError('BUSY', 'Two metadata operations are already running. Wait a moment and retry.', 429);
  busy++;
  try { return await operation(); } finally { busy--; }
}
export class MediaMetadataService {
  constructor(private provider: MediaExecutionProvider = executionProvider()) {}
  analyze(raw: string, signal?: AbortSignal) {
    const url = validateMediaUrl(raw);
    return bounded(async () => {
      const json = await this.provider.ytdlp(['--skip-download', '--no-playlist', '--dump-single-json', '--', currentVideoUrl(url)], { signal, timeoutMs: 60000 });
      try { const raw = JSON.parse(json); if (raw._type === 'playlist' || raw._type === 'multi_video' || Array.isArray(raw.entries)) throw new AppError('PLAYLIST', 'Playlist detected. View its items and select one video; whole playlists are never downloaded automatically.', 422); return parseMetadata(raw, url); } catch (e) { if (e instanceof AppError) throw e; throw new AppError('METADATA', 'yt-dlp returned unexpected metadata. Update yt-dlp and retry.', 422); }
    });
  }
  playlist(raw: string) {
    const url = validateMediaUrl(raw);
    if (!isPlaylist(url)) throw new AppError('PLAYLIST', 'Enter a playlist URL.');
    return bounded(async () => {
      const json = await this.provider.ytdlp(['--skip-download', '--flat-playlist', '--playlist-end', '50', '--dump-single-json', '--', url], { timeoutMs: 60000 });
      const result = z.object({ playlist_count: z.number().nullable().optional(), entries: z.array(z.unknown()) }).parse(JSON.parse(json));
      return { total: result.playlist_count ?? result.entries.length, limited: result.entries.length === 50, entries: result.entries.flatMap(item => { try { return [parseSummary(item)]; } catch { return []; } }) };
    });
  }
}
export class MediaSearchService {
  constructor(private provider: MediaExecutionProvider = executionProvider()) {}
  search(query: string) {
    return bounded(async () => {
      const json = await this.provider.ytdlp(['--skip-download', '--flat-playlist', '--dump-single-json', '--', `ytsearch15:${query}`], { timeoutMs: 60000 });
      let entries: unknown[];
      try { entries = z.object({ entries: z.array(z.unknown()) }).parse(JSON.parse(json)).entries; } catch { throw new AppError('SEARCH', 'yt-dlp returned an unexpected search response.', 422); }
      return entries.flatMap(item => { try { return [parseSummary(item)]; } catch { return []; } });
    });
  }
}

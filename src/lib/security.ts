import path from 'node:path';
import { z } from 'zod';
import { AppError } from './errors';
import { audioFormats, bitrates } from '../types/options';

const hosts = ['youtube.com', 'youtu.be', 'vimeo.com', 'archive.org', 'upload.wikimedia.org', 'media.w3.org', 'download.blender.org'];
export function validateMediaUrl(raw: string): string {
  let url: URL;
  try { url = new URL(raw.trim()); } catch { throw new AppError('INVALID_URL', 'Enter a complete supported HTTPS media URL.'); }
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') || raw.length > 2048 || !hosts.some(host => url.hostname === host || url.hostname.endsWith(`.${host}`))) {
    throw new AppError('INVALID_URL', 'Use a public HTTPS URL from YouTube, Vimeo, Internet Archive, Wikimedia, W3C, or Blender. Private network URLs and credentials are not allowed.');
  }
  url.hash = '';
  return url.toString();
}
export function isPlaylist(url: string) { const u = new URL(url); return u.searchParams.has('list') || u.pathname.includes('/playlist'); }
export function currentVideoUrl(url: string) {
  const u = new URL(url);
  if (u.hostname.endsWith('youtube.com') && !u.searchParams.get('v') && u.pathname === '/playlist') throw new AppError('PLAYLIST', 'This is a playlist. View its entries and select a video first.');
  u.searchParams.delete('list'); u.searchParams.delete('index');
  return u.toString();
}
export function safeFilename(input: string) {
  let name = input.normalize('NFKC').replace(/[<>:"/\\|?*\x00-\x1f\x7f]/g, '_').replace(/\.{2,}/g, '_').trim().slice(0, 110).replace(/[ .]+$/g, '');
  if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:[ .]|$)/i.test(name)) name = `_${name}`;
  return name || 'Untitled media';
}
export function within(root: string, candidate: string) {
  const resolved = path.resolve(root, candidate);
  const relative = path.relative(path.resolve(root), resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative) || relative === '') throw new AppError('PATH', 'Unsafe file path.');
  return resolved;
}
export { audioFormats, bitrates } from '../types/options';
export const settingsSchema = z.object({
  defaultType: z.enum(['audio', 'video']).default('audio'),
  audioFormat: z.enum(audioFormats).default('mp3'),
  bitrate: z.union([z.literal('auto'), z.number().refine(n => bitrates.includes(n as typeof bitrates[number]))]).default(192),
  videoContainer: z.enum(['mp4', 'mkv', 'webm']).default('mp4'),
  resolution: z.union([z.literal('best'), z.number().int().min(144).max(4320)]).default('best'),
  concurrency: z.number().int().min(1).max(4).default(2),
  embedMetadata: z.boolean().default(true),
  embedThumbnail: z.boolean().default(false),
  naming: z.enum(['title', 'uploader-title']).default('title'),
  existing: z.enum(['rename', 'skip', 'overwrite']).default('rename'),
}).strict();
export type Settings = z.infer<typeof settingsSchema>;
export const downloadSchema = z.object({
  url: z.string().max(2048).transform(validateMediaUrl),
  type: z.enum(['audio', 'video']),
  format: z.enum([...audioFormats, 'mp4', 'mkv', 'webm']),
  bitrate: z.union([z.literal('auto'), z.number().refine(n => bitrates.includes(n as typeof bitrates[number]))]).default(192),
  resolution: z.union([z.literal('best'), z.number().int().min(144).max(4320)]).default('best'),
  exactFormatId: z.string().regex(/^[a-zA-Z0-9_.-]{1,80}$/).optional(),
  rightsConfirmed: z.literal(true),
}).strict().refine(x => x.type === 'audio' ? audioFormats.includes(x.format as typeof audioFormats[number]) : ['mp4', 'mkv', 'webm'].includes(x.format), 'Choose a format appropriate for the selected mode.');
export type DownloadRequest = z.infer<typeof downloadSchema>;

import { readConfig } from '../config/env';
import { database } from '../db';
import { executionProvider } from './execution/provider';

export const encoderNames = { mp3: 'libmp3lame', m4a: 'aac', aac: 'aac', opus: 'libopus', flac: 'flac', wav: 'pcm_s16le' } as const;
export async function toolCapabilities() {
  const config = readConfig(), provider = executionProvider(config);
  const probe = async (run: () => Promise<string>) => { try { const out = await run(); return { detected: true, version: out.split(/\r?\n/)[0].slice(0, 180), message: null as string | null }; } catch (error) { return { detected: false, version: null, message: error instanceof Error ? error.message : 'Tool unavailable.' }; } };
  const [ytdlp, ffmpeg, ffprobe] = await Promise.all([
    probe(() => provider.ytdlp(['--version'], { timeoutMs: 10000 })),
    probe(() => provider.ffmpeg(['-version'], { timeoutMs: 10000 })),
    probe(() => provider.ffprobe(['-version'], { timeoutMs: 10000 })),
  ]);
  let encoders = '', muxers = '';
  if (ffmpeg.detected) {
    [encoders, muxers] = await Promise.all([provider.ffmpeg(['-encoders'], { timeoutMs: 10000 }), provider.ffmpeg(['-muxers'], { timeoutMs: 10000 })]);
  }
  const audioFormats = Object.entries(encoderNames).filter(([, name]) => new RegExp(`\\s${name}\\s`).test(encoders)).map(([format]) => format);
  const videoContainers = ['mp4', 'matroska', 'webm'].filter(name => new RegExp(`\\s${name}\\s`).test(muxers)).map(name => name === 'matroska' ? 'mkv' : name);
  return { node: process.version, applicationVersion: '0.1.0', environment: process.env.NODE_ENV || 'development', provider: provider.kind, cloud: config.cloud, databaseMode: config.databaseMode, ytdlp, ffmpeg, ffprobe, audioFormats, videoContainers, search: ytdlp.detected, metadata: ytdlp.detected, localProcessing: !config.cloud && ytdlp.detected && ffmpeg.detected && ffprobe.detected, downloadConcurrency: config.DOWNLOAD_CONCURRENCY };
}
let cached: { expires: number; value: Awaited<ReturnType<typeof toolCapabilities>> } | undefined;
export async function capabilities(refresh = false) {
  if (!refresh && cached && cached.expires > Date.now()) return cached.value;
  const value = await toolCapabilities(); cached = { value, expires: Date.now() + 60000 }; return value;
}
export async function diagnostics() {
  let databaseHealth: { connected: boolean; message: string };
  try { await database().client.execute('SELECT 1 AS healthy'); databaseHealth = { connected: true, message: 'Database connected.' }; } catch { databaseHealth = { connected: false, message: 'Database unavailable. Check configuration and run migrations.' }; }
  return { ...await capabilities(true), databaseHealth };
}

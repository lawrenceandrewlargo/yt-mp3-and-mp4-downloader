import path from 'node:path';
import { z } from 'zod';

const schema = z.object({
  DATABASE_URL: z.string().default('file:./data/app.db'),
  DATABASE_AUTH_TOKEN: z.string().optional(),
  MEDIA_EXECUTION_PROVIDER: z.enum(['auto', 'local', 'metadata']).default('auto'),
  DOWNLOAD_DIRECTORY: z.string().default('./downloads'),
  TEMP_DIRECTORY: z.string().default('./data/tmp'),
  DOWNLOAD_CONCURRENCY: z.coerce.number().int().min(1).max(4).default(2),
  MEDIA_TIMEOUT_SECONDS: z.coerce.number().int().min(10).max(7200).default(1800),
  YTDLP_PATH: z.string().default('yt-dlp'),
  FFMPEG_PATH: z.string().default('ffmpeg'),
  FFPROBE_PATH: z.string().default('ffprobe'),
  CLOUD_YTDLP_PATH: z.string().optional(),
  VERCEL: z.string().optional(),
});

export function readConfig(environment: Record<string, string | undefined> = process.env) {
  const parsed = schema.safeParse(environment);
  if (!parsed.success) throw new Error('Invalid server configuration. Check the documented environment variables.');
  const value = parsed.data;
  const cloud = value.VERCEL === '1' || value.MEDIA_EXECUTION_PROVIDER === 'metadata';
  const dbUrl = value.DATABASE_URL;
  if (!/^(file:|libsql:\/\/|https:\/\/)/.test(dbUrl)) throw new Error('DATABASE_URL must use file:, libsql://, or https://.');
  if (cloud && dbUrl.startsWith('file:')) throw new Error('Cloud mode requires Turso. Configure DATABASE_URL and DATABASE_AUTH_TOKEN; local SQLite is not persistent on Vercel.');
  if (!dbUrl.startsWith('file:') && !value.DATABASE_AUTH_TOKEN) throw new Error('Turso requires DATABASE_AUTH_TOKEN.');
  const executable = (name: string) => /[\\/]/.test(name) ? path.resolve(name) : name;
  return { ...value, YTDLP_PATH: executable(value.YTDLP_PATH), FFMPEG_PATH: executable(value.FFMPEG_PATH), FFPROBE_PATH: executable(value.FFPROBE_PATH), CLOUD_YTDLP_PATH: value.CLOUD_YTDLP_PATH ? executable(value.CLOUD_YTDLP_PATH) : undefined, cloud, databaseMode: dbUrl.startsWith('file:') ? 'local' as const : 'turso' as const,
    downloadRoot: path.resolve(value.DOWNLOAD_DIRECTORY), tempRoot: path.resolve(value.TEMP_DIRECTORY),
    ytdlp: cloud ? value.CLOUD_YTDLP_PATH ? executable(value.CLOUD_YTDLP_PATH) : null : executable(value.YTDLP_PATH),
    timeoutMs: value.MEDIA_TIMEOUT_SECONDS * 1000,
  };
}
export type Config = ReturnType<typeof readConfig>;

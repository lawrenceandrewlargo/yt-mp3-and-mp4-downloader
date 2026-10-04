import { readConfig, type Config } from '../../config/env';
import { AppError } from '../../lib/errors';
import { runProcess, type ProcessOptions } from './process';

export interface MediaExecutionProvider {
  readonly kind: 'local' | 'metadata';
  ytdlp(args: string[], options?: Partial<ProcessOptions>): Promise<string>;
  ffmpeg(args: string[], options?: Partial<ProcessOptions>): Promise<string>;
  ffprobe(args: string[], options?: Partial<ProcessOptions>): Promise<string>;
}
export class LocalMediaExecutionProvider implements MediaExecutionProvider {
  readonly kind = 'local' as const;
  constructor(private config: Config) {}
  async ytdlp(args: string[], options: Partial<ProcessOptions> = {}) {
    return runProcess(this.config.YTDLP_PATH, ['--ignore-config', '--no-plugin-dirs', '--no-js-runtimes', '--js-runtimes', `node:${process.execPath}`, '--no-remote-components', '--xff', 'never', '--no-cache-dir', '--socket-timeout', '20', '--retries', '2', ...args], { tempRoot: this.config.tempRoot, ...options });
  }
  ffmpeg(args: string[], options: Partial<ProcessOptions> = {}) { return runProcess(this.config.FFMPEG_PATH, ['-hide_banner', '-nostdin', ...args], { tempRoot: this.config.tempRoot, ...options }); }
  ffprobe(args: string[], options: Partial<ProcessOptions> = {}) { return runProcess(this.config.FFPROBE_PATH, ['-hide_banner', ...args], { tempRoot: this.config.tempRoot, ...options }); }
}
export class MetadataExecutionProvider implements MediaExecutionProvider {
  readonly kind = 'metadata' as const;
  constructor(private config: Config) {}
  async ytdlp(args: string[], options: Partial<ProcessOptions> = {}) {
    if (!this.config.CLOUD_YTDLP_PATH) throw new AppError('CLOUD_METADATA_UNAVAILABLE', 'Cloud research mode: search and analysis require a packaged yt-dlp binary. Run locally or configure the optional cloud metadata binary.', 503);
    // Never allow a caller to turn this provider into a downloader.
    if (!args.includes('--skip-download') && !args.includes('--version')) throw new AppError('CLOUD_PROCESSING', 'Local media processing is required for downloads.', 503);
    return runProcess(this.config.CLOUD_YTDLP_PATH, ['--ignore-config', '--no-plugin-dirs', '--no-js-runtimes', '--js-runtimes', `node:${process.execPath}`, '--no-remote-components', '--xff', 'never', '--no-cache-dir', '--socket-timeout', '15', '--retries', '1', ...args], { ...options, tempRoot: '/tmp/media-research', timeoutMs: Math.min(options.timeoutMs ?? 45000, 45000) });
  }
  async ffmpeg(): Promise<string> { throw new AppError('CLOUD_PROCESSING', 'Local FFmpeg processing is required.', 503); }
  async ffprobe(): Promise<string> { throw new AppError('CLOUD_PROCESSING', 'Local ffprobe processing is required.', 503); }
}
export function executionProvider(config = readConfig()): MediaExecutionProvider { return config.cloud ? new MetadataExecutionProvider(config) : new LocalMediaExecutionProvider(config); }

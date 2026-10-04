import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { AppError, processError } from '../../lib/errors';

export interface ProcessOptions { signal?: AbortSignal; timeoutMs?: number; cwd?: string; tempRoot: string; onLine?: (line: string) => void; capture?: boolean }
export async function runProcess(executable: string, args: string[], options: ProcessOptions, spawnProcess: typeof spawn = spawn): Promise<string> {
  await mkdir(options.tempRoot, { recursive: true });
  options.signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const allowed = /^(PATH|SYSTEMROOT|WINDIR|COMSPEC|PATHEXT|HOME|USERPROFILE|APPDATA|LOCALAPPDATA|SSL_CERT_FILE|SSL_CERT_DIR|HTTP_PROXY|HTTPS_PROXY|ALL_PROXY|NO_PROXY)$/i;
    const env: NodeJS.ProcessEnv = { NODE_ENV: process.env.NODE_ENV ?? 'development', ...Object.fromEntries(Object.entries(process.env).filter(([key]) => allowed.test(key))) };
    // Windows environment keys are case insensitive. Remove aliases first.
    for (const key of Object.keys(env)) if (/^(TEMP|TMP|TMPDIR)$/i.test(key)) delete env[key];
    Object.assign(env, { TEMP: options.tempRoot, TMP: options.tempRoot, TMPDIR: options.tempRoot });
    let child: ReturnType<typeof spawn>;
    try { child = spawnProcess(executable, args, { shell: false, windowsHide: true, detached: process.platform !== 'win32', cwd: options.cwd, env, stdio: ['ignore', 'pipe', 'pipe'] }); }
    catch { reject(new AppError('PROCESS_BLOCKED', 'The runtime could not launch a media tool. This environment may restrict child processes. Run on a local Node.js 24 installation and check diagnostics.', 503)); return; }
    let output = '', error = '', pending = '', termination: AppError | undefined, killing = false;
    const kill = (reason: AppError) => {
      if (killing) return;
      killing = true; termination = reason;
      if (child.pid) {
        if (process.platform === 'win32') {
          try { const killer = spawnProcess('taskkill', ['/PID', String(child.pid), '/T', '/F'], { shell: false, windowsHide: true, stdio: 'ignore' }); killer.on('error', () => child.kill('SIGKILL')); killer.on('close', code => { if (code !== 0) child.kill('SIGKILL'); }); }
          catch { child.kill('SIGKILL'); }
        } else { try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); } }
      }
    };
    const abort = () => kill(new AppError('CANCELLED', 'Download cancelled.', 409));
    options.signal?.addEventListener('abort', abort, { once: true });
    if (options.signal?.aborted) abort();
    const timer = setTimeout(() => kill(new AppError('TIMEOUT', 'The media operation timed out. Try a smaller file or check the network.', 504)), options.timeoutMs ?? 60000);
    child.stdout!.setEncoding('utf8'); child.stderr!.setEncoding('utf8');
    child.stdout!.on('data', (chunk: string) => {
      if (options.capture !== false) {
        output += chunk;
        if (Buffer.byteLength(output) > 16 * 1024 * 1024) kill(new AppError('OUTPUT_LIMIT', 'The metadata response exceeded the safe size limit.', 422));
      }
      pending += chunk;
      const lines = pending.split(/\r?\n/); pending = lines.pop() ?? '';
      for (const line of lines) { try { options.onLine?.(line); } catch { kill(new AppError('OUTPUT', 'Unexpected media progress response.', 422)); } }
      if (pending.length > 16 * 1024 * 1024) kill(new AppError('OUTPUT_LIMIT', 'The media response exceeded the safe size limit.', 422));
    });
    child.stderr!.on('data', (chunk: string) => { error = (error + chunk).slice(-32000); });
    child.on('error', (err: NodeJS.ErrnoException) => {
      clearTimeout(timer); options.signal?.removeEventListener('abort', abort);
      reject(new AppError('TOOL_MISSING', `${/ffprobe/i.test(executable) ? 'ffprobe' : /ffmpeg/i.test(executable) ? 'FFmpeg' : 'yt-dlp'} could not start${err.code === 'ENOENT' ? ' because it was not found' : ''}. Check diagnostics and the administrator tool configuration.`, 503));
    });
    child.on('close', code => {
      clearTimeout(timer); options.signal?.removeEventListener('abort', abort);
      if (termination) return reject(termination);
      if (code !== 0) return reject(processError(error));
      try { if (pending) options.onLine?.(pending); }
      catch { return reject(new AppError('OUTPUT', 'Unexpected media progress response.', 422)); }
      resolve(output);
    });
  });
}

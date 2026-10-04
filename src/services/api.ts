import { z, ZodError } from 'zod';
import { randomUUID } from 'node:crypto';
import { readFile, realpath, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import { AppError } from '../lib/errors';
import { log } from '../lib/logger';
import { downloadSchema, settingsSchema, within } from '../lib/security';
import { readConfig } from '../config/env';
import { capabilities, diagnostics } from '../media/diagnostics';
import { MediaMetadataService, MediaSearchService } from '../media/metadata';
import { localIdentity } from './local-identity';
import * as repository from '../repositories/app';

const identifier = z.string().uuid();
export async function requestJson(request: Request) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new AppError('CONTENT_TYPE', 'Send application/json.', 415);
  const reader = request.body?.getReader(); if (!reader) throw new AppError('BODY', 'A JSON body is required.');
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > 16384) { await reader.cancel(); throw new AppError('BODY_SIZE', 'The request is too large.', 413); } chunks.push(value); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown; } catch { throw new AppError('JSON', 'Send valid JSON.'); }
}
export function checkOrigin(request: Request) {
  const origin = request.headers.get('origin');
  // Next may construct request.url with its internal hostname (localhost), even
  // when the browser correctly uses the loopback bind (127.0.0.1).
  // Host is the incoming HTTP authority; never trust arbitrary forwarded hosts.
  const target = new URL(request.url), host = request.headers.get('host') ?? target.host;
  const protocol = process.env.VERCEL === '1' && request.headers.get('x-forwarded-proto') === 'https' ? 'https:' : target.protocol;
  if (origin && origin !== `${protocol}//${host}`) throw new AppError('ORIGIN', 'Cross-origin requests are not allowed.', 403);
  if (request.headers.get('sec-fetch-site') === 'cross-site') throw new AppError('ORIGIN', 'Cross-site requests are not allowed.', 403);
}
async function requireWorker() {
  const caps = await capabilities();
  if (caps.cloud) throw new AppError('CLOUD_PROCESSING', 'Cloud deployment is operating in research/metadata mode. Local media processing is required for this download operation.', 503);
  if (!caps.localProcessing) throw new AppError('TOOLS', 'yt-dlp, FFmpeg, and ffprobe are required. Check diagnostics.', 503);
  let timestamp = 0;
  try { timestamp = Number(await readFile('data/worker-heartbeat', 'utf8')); } catch { /* not started */ }
  if (Date.now() - timestamp > 10000) throw new AppError('WORKER', 'The local download worker is not running. Start npm run dev or npm run worker.', 503);
  return localIdentity();
}
function json(value: unknown, status = 200) { return Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } }); }
export async function dispatch(request: Request, segments: string[]): Promise<Response> {
  const requestId = randomUUID();
  try {
    checkOrigin(request);
    const route = segments.join('/'), method = request.method;
    if (route === 'capabilities' && method === 'GET') return json(await capabilities());
    if (route === 'diagnostics' && method === 'GET') return json(await diagnostics());
    if (route === 'settings' && method === 'GET') return json(await repository.getSettings());
    if (route === 'settings' && method === 'PUT') return json(await repository.saveSettings(settingsSchema.parse(await requestJson(request))));
    if (route === 'search/history' && method === 'GET') return json(await repository.searchHistory());
    if (route === 'search/history' && method === 'DELETE') { await repository.clearSearches(); return json({ cleared: true }); }
    if (route === 'search' && method === 'POST') {
      const { query } = z.object({ query: z.string().trim().min(2).max(160) }).strict().parse(await requestJson(request));
      const results = await new MediaSearchService().search(query);
      await repository.recordSearch(query);
      return json(results);
    }
    if (['analyze', 'playlist'].includes(route) && method === 'POST') {
      const { url } = z.object({ url: z.string().max(2048) }).strict().parse(await requestJson(request));
      const service = new MediaMetadataService();
      return json(route === 'playlist' ? await service.playlist(url) : await service.analyze(url, request.signal));
    }
    if (route === 'jobs' && method === 'GET') {
      const list = await repository.listJobs();
      const identity = readConfig().cloud ? null : await localIdentity();
      return json(list.map(job => ({ ...job, fileAvailable: job.status === 'completed' && job.executionId === identity && !!job.outputRelativePath, executionId: undefined, outputRelativePath: undefined })));
    }
    if (route === 'jobs' && method === 'POST') {
      const input = downloadSchema.parse(await requestJson(request));
      const identity = await requireWorker();
      return json(await repository.createJob(input, identity), 201);
    }
    if (segments[0] === 'jobs' && segments[1]) {
      const id = identifier.parse(segments[1]);
      const job = await repository.getJob(id); if (!job) throw new AppError('NOT_FOUND', 'Job not found.', 404);
      if (segments.length === 2 && method === 'DELETE') {
        if (!['completed','failed','cancelled'].includes(job.status)) throw new AppError('ACTIVE', 'Cancel the active job before removing its history.', 409);
        await repository.removeJob(id); return json({ removed: true });
      }
      if (segments[2] === 'cancel' && method === 'POST') {
        if (readConfig().cloud || job.executionId !== await localIdentity()) throw new AppError('LOCAL_JOB', 'Cancel this job on the computer running it.', 409);
        if (!['completed','failed','cancelled'].includes(job.status)) await repository.updateJob(id, { cancelRequested: true, ...(job.status === 'queued' ? {status:'cancelled', completedAt:Date.now()} : {}) });
        return json({ cancellationRequested: true });
      }
      if (segments[2] === 'retry' && method === 'POST') {
        if (!['failed','cancelled'].includes(job.status)) throw new AppError('RETRY', 'Only failed or cancelled jobs can be retried.', 409);
        const identity = await requireWorker();
        return json(await repository.createJob(downloadSchema.parse(job.request), identity), 201);
      }
      if (segments[2] === 'file' && method === 'GET') {
        const config = readConfig();
        if (config.cloud || job.executionId !== await localIdentity() || job.status !== 'completed' || !job.outputRelativePath || !job.outputFilename) throw new AppError('LOCAL_FILE', 'This file is available only on the computer that downloaded it.', 404);
        let file: string;
        try { file = await realpath(within(config.downloadRoot, job.outputRelativePath)); within(await realpath(config.downloadRoot), file); } catch { throw new AppError('FILE_MISSING', 'The downloaded file has moved or is no longer available.', 404); }
        const info = await stat(file); if (!info.isFile()) throw new AppError('FILE_MISSING', 'The file is unavailable.', 404);
        const stream = createReadStream(file);
        request.signal.addEventListener('abort', () => stream.destroy(), { once: true });
        return new Response(Readable.toWeb(stream) as ReadableStream, { headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': String(info.size), 'Content-Disposition': `attachment; filename="media.${job.request.format}"; filename*=UTF-8''${encodeURIComponent(job.outputFilename).replace(/'/g, '%27')}`, 'Cache-Control': 'no-store' } });
      }
    }
    throw new AppError('NOT_FOUND', 'Endpoint not found.', 404);
  } catch (error) {
    const expected = error instanceof AppError;
    log(expected ? 'warn' : 'error', 'api.failed', { requestId, code: expected ? error.code : error instanceof ZodError ? 'VALIDATION' : 'SERVER' });
    return json({ error: expected ? error.message : error instanceof ZodError ? 'Invalid input. Check the submitted URL, format, quality, and settings.' : 'The application could not complete the request. Check database configuration, migrations, and diagnostics.', code: expected ? error.code : error instanceof ZodError ? 'VALIDATION' : 'SERVER', requestId }, expected ? error.status : error instanceof ZodError ? 400 : 503);
  }
}

import './env';
import { open, readFile, rm, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { readConfig } from '../src/config/env';
import { database } from '../src/db';
import { jobs } from '../src/db/schema';
import { activeStatuses, getSettings, updateJob } from '../src/repositories/app';
import { localIdentity } from '../src/services/local-identity';
import { executionProvider } from '../src/media/execution/provider';
import { capabilities } from '../src/media/diagnostics';
import { runDownload } from '../src/media/download/pipeline';
import { downloadSchema, settingsSchema, within } from '../src/lib/security';
import type { Progress, JobStatus } from '../src/types/media';
import { AppError } from '../src/lib/errors';
import { log } from '../src/lib/logger';

const config = readConfig();
if (config.cloud) throw new Error('The local worker must not run on Vercel.');
const executionId = await localIdentity();
await mkdir(config.tempRoot, { recursive: true });
const lockPath = path.resolve('data/worker.lock');
try {
  const lock = await open(lockPath, 'wx'); await lock.writeFile(String(process.pid)); await lock.close();
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
  const pid = Number(await readFile(lockPath, 'utf8'));
  let alive = false; try { process.kill(pid, 0); alive = true; } catch { /* stale lock */ }
  if (alive) throw new Error('Another worker is running for this checkout. Stop it before starting another.');
  await rm(lockPath); const lock = await open(lockPath, 'wx'); await lock.writeFile(String(process.pid)); await lock.close();
}
const { db } = database();
const interrupted = await db.select().from(jobs).where(and(eq(jobs.executionId, executionId), inArray(jobs.status, [...activeStatuses])));
for (const job of interrupted) {
  if (/^[0-9a-f-]{36}$/.test(job.id)) await rm(within(config.tempRoot, job.id), { recursive: true, force: true });
  await updateJob(job.id, { status: job.cancelRequested ? 'cancelled' : 'failed', completedAt: Date.now(), error: 'The worker was interrupted. Analyze the source and retry.' });
}
const active = new Map<string, { controller: AbortController; completion: Promise<void> }>();
let stopping = false, lastHealth = 0;
const heartbeat = path.resolve('data/worker-heartbeat');
const provider = executionProvider(config);
async function execute(id: string) {
  const controller = new AbortController();
  let pending: { status: JobStatus; progress: Progress } | undefined;
  const flush = async () => { const value = pending; pending = undefined; if (value) await updateJob(id, value); };
  const completion = (async () => {
    let polling = Promise.resolve(), pollBusy = false, finalized = false;
    const timer = setInterval(() => {
      if (pollBusy || finalized) return;
      pollBusy = true;
      polling = (async () => { const row = await db.select().from(jobs).where(eq(jobs.id, id)).get(); if (row?.cancelRequested) controller.abort(); if (!finalized) await flush(); })().catch(() => controller.abort()).finally(() => { pollBusy = false; });
    }, 400);
    try {
      const job = await db.select().from(jobs).where(eq(jobs.id, id)).get();
      if (!job) return;
      const result = await runDownload(config, provider, id, downloadSchema.parse(job.request), settingsSchema.parse(job.settings), controller.signal, {
        update: (status, progress) => { pending = { status, progress }; },
        metadata: async media => { await updateJob(id, { title: media.title, source: media.source, thumbnail: media.thumbnail }); },
      });
      finalized = true; clearInterval(timer); await polling; await flush();
      await updateJob(id, { status: 'completed', completedAt: Date.now(), outputFilename: result.filename, outputRelativePath: result.relativePath, error: null, progress: { stage: result.skipped ? 'Existing file kept' : 'Completed', percent: 100 } });
      log('info', 'download.completed', { id });
    } catch (error) {
      finalized = true; clearInterval(timer); await polling; pending = undefined;
      const cancelled = controller.signal.aborted || error instanceof AppError && error.code === 'CANCELLED';
      await updateJob(id, { status: cancelled ? 'cancelled' : 'failed', completedAt: Date.now(), error: cancelled ? null : error instanceof AppError ? error.message : 'The download failed. Check diagnostics, disk space, and source availability.', progress: { stage: cancelled ? 'Cancelled' : 'Failed' } });
      log('warn', 'download.ended', { id, code: cancelled ? 'CANCELLED' : error instanceof AppError ? error.code : 'UNKNOWN' });
    } finally { active.delete(id); }
  })();
  active.set(id, { controller, completion });
}
const shutdown = () => { stopping = true; for (const job of active.values()) job.controller.abort(); };
process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
process.on('message', message => { if (typeof message === 'object' && message !== null && 'type' in message && message.type === 'shutdown') shutdown(); });
log('info', 'worker.started', { concurrency: config.DOWNLOAD_CONCURRENCY });
try {
  while (!stopping) {
    try {
      if (Date.now() - lastHealth > 1500) { await writeFile(heartbeat, String(Date.now())); lastHealth = Date.now(); }
      const settings = await getSettings();
      const pending = await db.select().from(jobs).where(and(eq(jobs.executionId, executionId), eq(jobs.status, 'queued'))).orderBy(asc(jobs.createdAt)).limit(settings.concurrency);
      for (const job of pending) {
        if (active.size >= settings.concurrency) break;
        if (job.cancelRequested) { await updateJob(job.id, { status: 'cancelled', completedAt: Date.now() }); continue; }
        const caps = await capabilities();
        if (!caps.localProcessing) { await updateJob(job.id, { status: 'failed', error: 'Required media tools are unavailable. Check diagnostics.', completedAt: Date.now() }); continue; }
        await updateJob(job.id, { status: 'analyzing', progress: { stage: 'Fetching metadata' } });
        await execute(job.id);
      }
    } catch { log('error', 'worker.poll_failed'); }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  await Promise.allSettled([...active.values()].map(job => job.completion));
} finally { await rm(lockPath, { force: true }); await rm(heartbeat, { force: true }); database().client.close(); }

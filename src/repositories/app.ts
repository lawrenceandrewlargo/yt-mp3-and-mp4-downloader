import { randomUUID } from 'node:crypto';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { database } from '../db';
import { jobs, preferences, searches } from '../db/schema';
import { readConfig } from '../config/env';
import { settingsSchema, type DownloadRequest, type Settings } from '../lib/security';
export const activeStatuses = ['analyzing', 'downloading', 'processing', 'merging', 'converting'] as const;
export async function getSettings() {
  const row = await database().db.select().from(preferences).where(eq(preferences.id, 1)).get();
  return settingsSchema.parse(row?.value ?? { concurrency: readConfig().DOWNLOAD_CONCURRENCY });
}
export async function saveSettings(value: Settings) {
  const settings = settingsSchema.parse(value);
  await database().db.insert(preferences).values({ id: 1, value: settings }).onConflictDoUpdate({ target: preferences.id, set: { value: settings } });
  return settings;
}
export async function listJobs() { return database().db.select().from(jobs).orderBy(desc(jobs.createdAt)).limit(100); }
export async function getJob(id: string) { return database().db.select().from(jobs).where(eq(jobs.id, id)).get(); }
export async function createJob(request: DownloadRequest, executionId: string) {
  const pending = await database().db.select({ id: jobs.id }).from(jobs).where(and(eq(jobs.executionId, executionId), inArray(jobs.status, ['queued', ...activeStatuses]))).limit(51);
  if (pending.length >= 50) throw new Error('The queue is full. Wait for existing jobs to finish.');
  const job = { id: randomUUID(), executionId, sourceUrl: request.url, request, settings: await getSettings(), createdAt: Date.now(), status: 'queued' as const };
  await database().db.insert(jobs).values(job);
  return getJob(job.id);
}
export async function updateJob(id: string, value: Partial<typeof jobs.$inferInsert>) { await database().db.update(jobs).set(value).where(eq(jobs.id, id)); }
export async function removeJob(id: string) { await database().db.delete(jobs).where(and(eq(jobs.id, id), inArray(jobs.status, ['completed', 'failed', 'cancelled']))); }
export async function searchHistory() { return database().db.select().from(searches).orderBy(desc(searches.createdAt)).limit(10); }
export async function recordSearch(query: string) {
  await database().db.insert(searches).values({ id: randomUUID(), query, createdAt: Date.now() });
  const stale = await database().db.select({ id: searches.id }).from(searches).orderBy(desc(searches.createdAt)).limit(1000).offset(10);
  if (stale.length) await database().db.delete(searches).where(inArray(searches.id, stale.map(x => x.id)));
}
export async function clearSearches() { await database().db.delete(searches); }

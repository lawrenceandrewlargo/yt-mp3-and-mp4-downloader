import { z } from 'zod';
import { database, createDatabase } from '../db';
import { jobs, preferences, searches } from '../db/schema';
import { downloadSchema, settingsSchema, safeFilename } from '../lib/security';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { readConfig } from '../config/env';

export async function backupLocalDatabase() {
  if (readConfig().databaseMode !== 'local') throw new Error('SQLite snapshot backup is local-only. Use db:export or turso db export for Turso.');
  await mkdir('backups', { recursive: true });
  const filename = path.resolve('backups', `media-research-${new Date().toISOString().replace(/[:.]/g,'-')}.db`);
  await database().client.execute({ sql: 'VACUUM INTO ?', args: [filename] });
  const snapshot = createDatabase(`file:${filename}`);
  try { const result = await snapshot.client.execute('PRAGMA integrity_check'); if (result.rows[0]?.integrity_check !== 'ok') throw new Error('The snapshot failed its integrity check.'); } finally { snapshot.client.close(); }
  return filename;
}
export async function exportData() {
  const { db } = database();
  // A read transaction gives a consistent portable export across all tables.
  return db.transaction(async tx => ({ version: 1 as const, exportedAt: new Date().toISOString(), preferences: await tx.select().from(preferences), jobs: (await tx.select().from(jobs)).map(job => ({ ...job, outputRelativePath: null, executionId: 'imported' })), searches: await tx.select().from(searches) }));
}
const timestamp = z.number().int().min(0).max(8640000000000000);
export const exportSchema = z.object({
  version: z.literal(1), exportedAt: z.string().datetime(),
  preferences: z.array(z.object({ id:z.literal(1), value:settingsSchema }).strict()).max(1),
  jobs: z.array(z.object({ id:z.string().uuid(),executionId:z.literal('imported'),sourceUrl:z.string().max(2048),title:z.string().max(500),thumbnail:z.string().url().nullable(),source:z.string().max(200),request:downloadSchema,settings:settingsSchema,status:z.enum(['queued','analyzing','downloading','processing','merging','converting','completed','failed','cancelled']),progress:z.object({stage:z.string().max(200),percent:z.number().min(0).max(100).optional(),downloadedBytes:z.number().nonnegative().optional(),totalBytes:z.number().nonnegative().optional(),speed:z.number().nonnegative().optional(),eta:z.number().nonnegative().optional()}).nullable(),cancelRequested:z.boolean(),outputFilename:z.string().max(200).nullable(),outputRelativePath:z.null(),error:z.string().max(2000).nullable(),createdAt:timestamp,completedAt:timestamp.nullable() }).strict()).max(10000),
  searches:z.array(z.object({id:z.string().uuid(),query:z.string().min(2).max(160),createdAt:timestamp}).strict()).max(10000),
}).strict();
export async function importData(raw: unknown) {
  const data = exportSchema.parse(raw), { db } = database();
  // Transaction checks emptiness again at the write boundary. No overwrite/merge mode.
  await db.transaction(async tx => {
    if ((await tx.select().from(jobs).limit(1)).length || (await tx.select().from(preferences).limit(1)).length || (await tx.select().from(searches).limit(1)).length) throw new Error('Import refused: the destination has application data. Use a new empty migrated database.');
    for (const row of data.preferences) await tx.insert(preferences).values(row);
    for (const row of data.jobs) {
      if (row.sourceUrl !== row.request.url) throw new Error('Import refused: inconsistent source URL.');
      await tx.insert(jobs).values({ ...row, thumbnail: row.thumbnail?.startsWith('https://') ? row.thumbnail : null, outputFilename: row.outputFilename ? safeFilename(row.outputFilename) : null, status: ['queued','analyzing','downloading','processing','merging','converting'].includes(row.status) ? 'failed' : row.status, error: ['queued','analyzing','downloading','processing','merging','converting'].includes(row.status) ? 'Imported interrupted job. Analyze the source and retry locally.' : row.error });
    }
    for (const row of data.searches) await tx.insert(searches).values(row);
  });
  return { jobs: data.jobs.length, searches: data.searches.length };
}

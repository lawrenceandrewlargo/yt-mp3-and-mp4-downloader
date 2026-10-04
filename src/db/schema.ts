import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import type { DownloadRequest, Settings } from '../lib/security';
import type { Progress, JobStatus } from '../types/media';
export const preferences = sqliteTable('preferences', { id: integer('id').primaryKey(), value: text('value', { mode: 'json' }).$type<Settings>().notNull() });
export const jobs = sqliteTable('download_jobs', {
  id: text('id').primaryKey(), executionId: text('execution_id').notNull(), sourceUrl: text('source_url').notNull(),
  title: text('title').notNull().default('Preparing media'), thumbnail: text('thumbnail'), source: text('source').notNull().default(''),
  request: text('request', { mode: 'json' }).$type<DownloadRequest>().notNull(), settings: text('settings', { mode: 'json' }).$type<Settings>().notNull(),
  status: text('status').$type<JobStatus>().notNull().default('queued'), progress: text('progress', { mode: 'json' }).$type<Progress>(),
  cancelRequested: integer('cancel_requested', { mode: 'boolean' }).notNull().default(false),
  outputFilename: text('output_filename'), outputRelativePath: text('output_relative_path'), error: text('error'),
  createdAt: integer('created_at').notNull(), completedAt: integer('completed_at'),
}, table => [index('jobs_status_created').on(table.status, table.createdAt), index('jobs_execution_queue').on(table.executionId, table.status, table.createdAt)]);
export const searches = sqliteTable('search_history', { id: text('id').primaryKey(), query: text('query').notNull(), createdAt: integer('created_at').notNull() }, table => [index('searches_created').on(table.createdAt)]);
export type Job = typeof jobs.$inferSelect;

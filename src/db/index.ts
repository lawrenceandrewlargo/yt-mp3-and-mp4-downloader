import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { readConfig } from '../config/env';
import * as schema from './schema';

export function createDatabase(url?: string, authToken?: string) {
  const config = url ? { DATABASE_URL: url, DATABASE_AUTH_TOKEN: authToken } : readConfig();
  if (config.DATABASE_URL.startsWith('file:') && config.DATABASE_URL !== 'file::memory:') mkdirSync(path.dirname(path.resolve(config.DATABASE_URL.slice(5))), { recursive: true });
  const client = createClient({ url: config.DATABASE_URL, authToken: config.DATABASE_AUTH_TOKEN });
  return { client, db: drizzle(client, { schema }) };
}
let instance: ReturnType<typeof createDatabase> | undefined;
export function database() { return instance ??= createDatabase(); }

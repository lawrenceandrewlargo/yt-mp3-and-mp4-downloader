import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { readConfig } from '../config/env';
export async function localIdentity() {
  if (readConfig().cloud) throw new Error('Local identity is unavailable in cloud mode.');
  const directory = path.resolve('data'); await mkdir(directory, { recursive: true });
  const file = path.join(directory, 'execution-id');
  try { return (await readFile(file, 'utf8')).trim(); } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    try { const id = randomUUID(); await writeFile(file, id, { flag: 'wx' }); return id; } catch (e) { if ((e as NodeJS.ErrnoException).code === 'EEXIST') return (await readFile(file, 'utf8')).trim(); throw e; }
  }
}

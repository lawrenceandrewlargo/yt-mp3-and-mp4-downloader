import { describe,it,expect,beforeAll,afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdir,readFile,writeFile } from 'node:fs/promises';
import path from 'node:path';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { createDatabase, database } from '../src/db';
import { searches, preferences } from '../src/db/schema';
import { settingsSchema } from '../src/lib/security';
import { dispatch, requestJson } from '../src/services/api';
import { backupLocalDatabase,exportData,importData,exportSchema } from '../src/services/data-transfer';
const directory=path.resolve('data',`tests-${randomUUID()}`);
let connection:ReturnType<typeof createDatabase>;
beforeAll(async()=>{await mkdir(directory,{recursive:true});process.env.DATABASE_URL=`file:${path.join(directory,'app.db')}`;connection=database();await migrate(connection.db,{migrationsFolder:'drizzle'});});
afterAll(()=>{connection.client.close();delete process.env.DATABASE_URL;});
const request=(route:string,method='GET',body?:unknown,headers:Record<string,string>={})=>new Request(`http://localhost/api/${route}`,{method,headers:{...(body?{'content-type':'application/json'}:{}),...headers},body:body?JSON.stringify(body):undefined});
describe('versioned local database',()=>{
 it('creates normalized tables plus migration journal',async()=>{const result=await connection.client.execute("SELECT name FROM sqlite_master WHERE type='table'");expect(result.rows.map(r=>r.name)).toEqual(expect.arrayContaining(['preferences','download_jobs','search_history','__drizzle_migrations']));});
 it('applies migration #1 then upgrades without losing data',async()=>{
  const first=path.join(directory,'first');await mkdir(path.join(first,'meta'),{recursive:true});
  const journal=JSON.parse(await readFile('drizzle/meta/_journal.json','utf8'));await writeFile(path.join(first,'meta/_journal.json'),JSON.stringify({...journal,entries:[journal.entries[0]]}));await writeFile(path.join(first,'0000_initial.sql'),await readFile('drizzle/0000_initial.sql'));
  const db=createDatabase(`file:${path.join(directory,'upgrade.db')}`);
  try{await migrate(db.db,{migrationsFolder:first});const id=randomUUID();await db.db.insert(searches).values({id,query:'preserve me',createdAt:1});await migrate(db.db,{migrationsFolder:'drizzle'});await migrate(db.db,{migrationsFolder:'drizzle'});expect((await db.db.select().from(searches))[0].query).toBe('preserve me');expect((await db.client.execute('SELECT COUNT(*) AS n FROM __drizzle_migrations')).rows[0].n).toBe(2);expect((await db.client.execute("SELECT name FROM sqlite_master WHERE type='index'")).rows.map(r=>r.name)).toContain('jobs_execution_queue');}finally{db.client.close();}
 });
 it('makes an integrity-checked SQLite snapshot',async()=>{const filename=await backupLocalDatabase();const snap=createDatabase(`file:${filename}`);expect((await snap.client.execute('PRAGMA integrity_check')).rows[0].integrity_check).toBe('ok');snap.client.close();});
 it('roundtrips an empty portable import and rejects invalid versions',async()=>{const value=await exportData();expect(exportSchema.parse(value).version).toBe(1);expect(exportSchema.safeParse({...value,version:2}).success).toBe(false);expect(await importData(value)).toEqual({jobs:0,searches:0});});
});
describe('API validation and database writes',()=>{
 it('persists settings through the API',async()=>{const value=settingsSchema.parse({bitrate:128});expect((await dispatch(request('settings','PUT',value),['settings'])).status).toBe(200);const response=await dispatch(request('settings'),['settings']);expect((await response.json()).bitrate).toBe(128);expect((await connection.db.select().from(preferences)).length).toBe(1);});
 it('rejects cross-origin writes',async()=>expect((await dispatch(request('settings','PUT',{}, {origin:'https://evil.test'}),['settings'])).status).toBe(403));
 it('validates browser origin against the incoming Host rather than Next internal hostname',async()=>{const value=settingsSchema.parse({bitrate:192});expect((await dispatch(request('settings','PUT',value,{origin:'http://127.0.0.1:3000',host:'127.0.0.1:3000'}),['settings'])).status).toBe(200);expect((await dispatch(request('settings','PUT',value,{origin:'https://evil.test',host:'127.0.0.1:3000','x-forwarded-host':'evil.test'}),['settings'])).status).toBe(403);});
 it('rejects invalid settings and unsupported private URLs',async()=>{expect((await dispatch(request('settings','PUT',{concurrency:99}),['settings'])).status).toBe(400);expect((await dispatch(request('analyze','POST',{url:'https://localhost/secret'}),['analyze'])).status).toBe(400);});
 it('returns empty jobs and clear search history',async()=>{expect(await (await dispatch(request('jobs'),['jobs'])).json()).toEqual([]);await connection.db.insert(searches).values({id:randomUUID(),query:'example',createdAt:1});expect((await dispatch(request('search/history','DELETE'),['search','history'])).status).toBe(200);expect((await connection.db.select().from(searches)).length).toBe(0);});
 it('does not overwrite data on import',async()=>expect(importData(await exportData())).rejects.toThrow('destination has application data'));
 it('rejects unknown endpoints, non-UUID identifiers, executable fields',async()=>{expect((await dispatch(request('bad'),['bad'])).status).toBe(404);expect((await dispatch(request('jobs/../file'),['jobs','../','file'])).status).toBe(400);expect((await dispatch(request('jobs','POST',{url:'https://youtube.com/watch?v=test',type:'audio',format:'mp3',rightsConfirmed:true,executable:'cmd.exe'}),['jobs'])).status).toBe(400);});
 it('enforces the JSON request limit even without content-length',async()=>{await expect(requestJson(request('settings','POST',{x:'a'.repeat(17000)}))).rejects.toThrow('too large');});
});

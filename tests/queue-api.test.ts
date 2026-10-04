import { beforeAll,afterAll,it,expect,vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdir,readFile,writeFile,rm } from 'node:fs/promises';
import path from 'node:path';
import { migrate } from 'drizzle-orm/libsql/migrator';
vi.mock('../src/media/diagnostics',()=>({capabilities:vi.fn(async()=>({cloud:false,localProcessing:true})),diagnostics:vi.fn()}));
import { database } from '../src/db';
import { getJob,updateJob } from '../src/repositories/app';
import { dispatch } from '../src/services/api';
const root=path.resolve('data',`queue-test-${randomUUID()}`);
let originalHeartbeat:string|undefined;
beforeAll(async()=>{await mkdir(root,{recursive:true});process.env.DATABASE_URL=`file:${path.join(root,'app.db')}`;await migrate(database().db,{migrationsFolder:'drizzle'});try{originalHeartbeat=await readFile('data/worker-heartbeat','utf8');}catch{}await writeFile('data/worker-heartbeat',String(Date.now()));});
afterAll(async()=>{database().client.close();delete process.env.DATABASE_URL;if(originalHeartbeat)await writeFile('data/worker-heartbeat',originalHeartbeat);else await rm('data/worker-heartbeat',{force:true});});
function req(route:string,body?:unknown){return new Request(`http://localhost/api/${route}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body??{})});}
it('persists a queued job, cancels queued work, and retries with a fresh ID',async()=>{
 const response=await dispatch(req('jobs',{url:'https://youtube.com/watch?v=owned',type:'audio',format:'mp3',bitrate:192,rightsConfirmed:true}),['jobs']);expect(response.status).toBe(201);const job=await response.json();expect((await getJob(job.id))?.status).toBe('queued');
 expect((await dispatch(req(`jobs/${job.id}/cancel`),['jobs',job.id,'cancel'])).status).toBe(200);expect((await getJob(job.id))?.status).toBe('cancelled');
 const retry=await dispatch(req(`jobs/${job.id}/retry`),['jobs',job.id,'retry']);expect(retry.status).toBe(201);expect((await retry.json()).id).not.toBe(job.id);
});
it('active cancellation is a request until the worker finishes cleanup',async()=>{
 const response=await dispatch(req('jobs',{url:'https://youtube.com/watch?v=owned',type:'video',format:'mp4',rightsConfirmed:true}),['jobs']);const job=await response.json();await updateJob(job.id,{status:'downloading'});
 await dispatch(req(`jobs/${job.id}/cancel`),['jobs',job.id,'cancel']);const updated=await getJob(job.id);expect(updated?.cancelRequested).toBe(true);expect(updated?.status).toBe('downloading');
 expect((await dispatch(new Request(`http://localhost/api/jobs/${job.id}`,{method:'DELETE'}),['jobs',job.id])).status).toBe(409);
});

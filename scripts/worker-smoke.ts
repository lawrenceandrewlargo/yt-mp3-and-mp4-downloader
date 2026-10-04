import './env';
import { strict as assert } from 'node:assert';
import { createJob,getJob,updateJob,removeJob } from '../src/repositories/app';
import { localIdentity } from '../src/services/local-identity';
import { downloadSchema } from '../src/lib/security';
import { database } from '../src/db';
const identity=await localIdentity();
const request=downloadSchema.parse({url:'https://media.w3.org/fixture-owned-test',type:'audio',format:'mp3',rightsConfirmed:true});
const job=await createJob(request,identity);assert(job);
try{
 const end=Date.now()+10000;let result=await getJob(job.id);
 while(result?.status==='queued'&&Date.now()<end){await new Promise(r=>setTimeout(r,250));result=await getJob(job.id);}
 assert.equal(result?.status,'failed');assert(result?.error?.includes('tools are unavailable'));console.log('PASS actual local worker marks missing-tool jobs failed without launching a download.');
 const cancelled=await createJob(request,identity);assert(cancelled);await updateJob(cancelled.id,{cancelRequested:true});
 const limit=Date.now()+10000;let cancelledRow=await getJob(cancelled.id);while(cancelledRow?.status==='queued'&&Date.now()<limit){await new Promise(r=>setTimeout(r,100));cancelledRow=await getJob(cancelled.id);}assert.equal(cancelledRow?.status,'cancelled');console.log('PASS actual worker handles queued cancellation.');await removeJob(cancelled.id);
}finally{await removeJob(job.id);database().client.close();}

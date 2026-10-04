import { strict as assert } from 'node:assert';
const base=process.env.SMOKE_BASE_URL||'http://127.0.0.1:3000';
for(const route of ['/','/history','/settings','/diagnostics','/api/settings','/api/jobs','/api/diagnostics']) {
 const response=await fetch(base+route);assert.equal(response.status,200,route);const body=await response.text();
 if(!route.startsWith('/api'))assert(body.includes('Media Lab'));console.log(`PASS ${route}`);
}
const response=await fetch(base+'/api/settings',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({concurrency:99})});assert.equal(response.status,400);console.log('PASS invalid API input');

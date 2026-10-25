import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {rm} from 'node:fs/promises';

// Exercise real HTTP through the same fetchImage used by preview, single download and ZIP.
test('HTTP image retries are shared, redirect budgets stay bounded and ZIP benefits too',async t=>{
  const counts=new Map();
  const server=http.createServer((req,res)=>{const n=(counts.get(req.url)||0)+1;counts.set(req.url,n);
    if(req.url==='/redirect'){res.writeHead(302,{Location:'/always-fail'});return res.end()}
    if(req.url==='/missing'){res.writeHead(404);return res.end()}
    if(req.url==='/always-fail'||n===1){res.writeHead(503,{'Retry-After':'0'});return res.end('busy')}
    res.writeHead(200,{'Content-Type':'image/jpeg'});res.end(Buffer.from([255,216,255,217]));
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  t.after(()=>new Promise(r=>server.close(r)));
  const base='http://127.0.0.1:'+server.address().port;
  process.env.LUMA_ALLOWED_ORIGINS=base;
  const {fetchImage,createJob,jobs}=await import('../lib/downloads.mjs');
  const {getRemote}=await import('../lib/network.mjs');
  assert.equal((await fetchImage({original:base+'/preview'})).type,'image/jpeg');
  assert.equal(counts.get('/preview'),2);
  await assert.rejects(fetchImage({original:base+'/missing'}),/404/);
  assert.equal(counts.get('/missing'),1);
  await assert.rejects(getRemote(base+'/redirect'),e=>e.statusCode===503&&e.retryAttempts===4);
  assert.equal(counts.get('/redirect'),4);assert.equal(counts.get('/always-fail'),4);
  const job=createJob({title:'Retry test',url:base+'/',photos:[{id:'p1',original:base+'/download.jpg'}]});
  try{const deadline=Date.now()+5000;while(['queued','running'].includes(job.status)&&Date.now()<deadline)await new Promise(r=>setTimeout(r,20));assert.equal(job.status,'done',job.error);assert.equal(job.completed,1);assert.equal(counts.get('/download.jpg'),2)}finally{jobs.delete(job.id);if(job.dir)await rm(job.dir,{recursive:true,force:true})}
});

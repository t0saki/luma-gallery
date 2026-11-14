import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtemp,mkdir,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {ZipArchive} from 'archiver';
import {createWriteStream} from 'node:fs';
import {createJob,cancelJob,jobs,initDownloads,purgeExpiredJobs,streamBatchJobs,JOB_TTL_MS} from '../lib/downloads.mjs';
async function settle(job){for(let i=0;i<200;i++){if(!['queued','running'].includes(job.status)){// allow asynchronous cleanup to finish
 await new Promise(r=>setTimeout(r,20));return;}await new Promise(r=>setTimeout(r,10));}throw Error('Job did not settle');}
async function makeDummyZip(filePath,name,content){await mkdir(path.dirname(filePath),{recursive:true});const out=createWriteStream(filePath);const z=new ZipArchive({store:true});const done=new Promise((res,rej)=>{out.on('close',res);out.on('error',rej);z.on('error',rej);});z.pipe(out);z.append(Buffer.from(content),{name});await z.finalize();await done;}
const album={title:'Test album',url:'https://example.com/',photos:[{id:'p1',title:'First',original:'http://127.0.0.1/one.jpg'}]};
test('cancelling a queued job stays cancelled and never starts a network download',async()=>{const job=createJob(album);cancelJob(job);await settle(job);assert.equal(job.status,'cancelled');assert.equal(job.completed,0);jobs.delete(job.id)});
test('all failed original downloads produce a failed job, not a false success ZIP',async()=>{const job=createJob(album);await settle(job);assert.equal(job.status,'failed');assert.equal(job.completed,0);assert.equal(job.failed.length,1);assert.match(job.error,/所有图片/);jobs.delete(job.id)});
test('selection must belong to the requested album',()=>{assert.throws(()=>createJob(album,['missing']),/所选图片无效/);assert.throws(()=>createJob(album,[]),/所选图片无效/)});
test('initDownloads restores done jobs, marks interrupted running jobs failed, and enforces 24h TTL',async()=>{
  assert.equal(JOB_TTL_MS,24*60*60*1000);
  const dir=await mkdtemp(path.join(tmpdir(),'luma-dl-test-'));
  try{
    const now=Date.now();
    const recentZip=path.join(dir,'job-recent','album.zip');
    const staleZip=path.join(dir,'job-stale','album.zip');
    await makeDummyZip(recentZip,'001.jpg','hello');
    await makeDummyZip(staleZip,'001.jpg','old');
    await writeFile(path.join(dir,'jobs.json'),JSON.stringify([
      {id:'recent-done',title:'Recent Album',fileName:'Recent Album.zip',total:1,completed:1,processed:1,failed:[],bytes:5,status:'done',error:'',createdAt:now-23*3600*1000,dir:path.dirname(recentZip),file:recentZip},
      {id:'stale-done',title:'Stale Album',fileName:'Stale Album.zip',total:1,completed:1,processed:1,failed:[],bytes:3,status:'done',error:'',createdAt:now-25*3600*1000,dir:path.dirname(staleZip),file:staleZip},
      {id:'interrupted',title:'Interrupted',fileName:'Interrupted.zip',total:3,completed:1,processed:1,failed:[],bytes:5,status:'running',error:'',createdAt:now-1000,dir:path.join(dir,'job-int'),file:''}
    ]));
    await initDownloads(dir);
    assert.equal(jobs.has('recent-done'),true);
    assert.equal(jobs.get('recent-done').status,'done');
    assert.equal(jobs.has('stale-done'),false);
    assert.equal(jobs.get('interrupted').status,'failed');
    assert.match(jobs.get('interrupted').error,/中断/);
    assert.equal(purgeExpiredJobs(now+2*3600*1000),true);
    assert.equal(jobs.has('recent-done'),false);
  }finally{
    await initDownloads(null);
    await rm(dir,{recursive:true,force:true});
  }
});
test('streamBatchJobs validates selection and packages multiple done ZIPs with unique names',async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'luma-batch-test-'));
  const server=http.createServer(async(req,res)=>{
    try{
      const url=new URL(req.url,'http://127.0.0.1');
      const ids=(url.searchParams.get('ids')||'').split(',').filter(Boolean);
      await streamBatchJobs(ids,res);
    }catch(e){
      if(!res.headersSent){res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({error:e.message}));}
    }
  });
  try{
    await initDownloads(dir);
    const z1=path.join(dir,'job-1','album.zip');
    const z2=path.join(dir,'job-2','album.zip');
    await makeDummyZip(z1,'a.txt','one');
    await makeDummyZip(z2,'b.txt','two');
    jobs.set('j1',{id:'j1',title:'Same',fileName:'Same.zip',status:'done',createdAt:Date.now(),dir:path.dirname(z1),file:z1,failed:[]});
    jobs.set('j2',{id:'j2',title:'Same',fileName:'Same.zip',status:'done',createdAt:Date.now(),dir:path.dirname(z2),file:z2,failed:[]});
    await new Promise(r=>server.listen(0,'127.0.0.1',r));
    const port=server.address().port;
    const bad=await fetch(`http://127.0.0.1:${port}/batch?ids=`);
    assert.equal(bad.status,400);
    const single=await fetch(`http://127.0.0.1:${port}/batch?ids=j1`);
    assert.equal(single.status,200);
    const singleBuf=Buffer.from(await single.arrayBuffer());
    assert.equal(singleBuf.subarray(0,2).toString(),'PK');
    assert.equal(singleBuf.includes('a.txt'),true);
    const multi=await fetch(`http://127.0.0.1:${port}/batch?ids=j1,j2`);
    assert.equal(multi.status,200);
    assert.match(multi.headers.get('content-disposition')||'',/luma-batch-/);
    const multiBuf=Buffer.from(await multi.arrayBuffer());
    assert.equal(multiBuf.subarray(0,2).toString(),'PK');
    assert.equal(multiBuf.includes('Same.zip'),true);
    assert.equal(multiBuf.includes('Same-2.zip'),true);
  }finally{
    server.close();
    await initDownloads(null);
    await rm(dir,{recursive:true,force:true});
  }
});

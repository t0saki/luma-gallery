import test from 'node:test';
import assert from 'node:assert/strict';
import {createJob,cancelJob,jobs} from '../lib/downloads.mjs';
async function settle(job){for(let i=0;i<200;i++){if(!['queued','running'].includes(job.status)){// allow asynchronous cleanup to finish
 await new Promise(r=>setTimeout(r,20));return;}await new Promise(r=>setTimeout(r,10));}throw Error('Job did not settle');}
const album={title:'Test album',url:'https://example.com/',photos:[{id:'p1',title:'First',original:'http://127.0.0.1/one.jpg'}]};
test('cancelling a queued job stays cancelled and never starts a network download',async()=>{const job=createJob(album);cancelJob(job);await settle(job);assert.equal(job.status,'cancelled');assert.equal(job.completed,0);jobs.delete(job.id)});
test('all failed original downloads produce a failed job, not a false success ZIP',async()=>{const job=createJob(album);await settle(job);assert.equal(job.status,'failed');assert.equal(job.completed,0);assert.equal(job.failed.length,1);assert.match(job.error,/所有图片/);jobs.delete(job.id)});
test('selection must belong to the requested album',()=>{assert.throws(()=>createJob(album,['missing']),/所选图片无效/);assert.throws(()=>createJob(album,[]),/所选图片无效/)});

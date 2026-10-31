import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createStore } from '../../src/core/store.js';
test('S7: SIGINT closes storage and owned child, preserves pending items and exits 130',async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gmr-interrupt-')),db=path.join(dir,'test.db');
  const child=spawn(process.execPath,['tests/helpers/slow-cli.mjs','run','https://www.google.com/maps/place/Test','--db',db],{cwd:new URL('../../',import.meta.url),stdio:['ignore','pipe','pipe']});
  t.after(()=>{child.kill('SIGKILL');fs.rmSync(dir,{recursive:true,force:true});});
  let stdout='',stderr='';child.stderr.on('data',b=>{stderr+=b;});
  const ready=new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error('no READY: '+stderr)),5000);child.stdout.on('data',b=>{stdout+=b;const match=/READY (\d+)/.exec(stdout);if(match){clearTimeout(timeout);resolve(+match[1]);}});});
  const exited=once(child,'exit'),ownedPid=await ready;child.kill('SIGINT');const [code]=await exited;
  assert.equal(code,130,stderr);assert.ok(stdout.includes('STORE_CLOSED'));assert.throws(()=>process.kill(ownedPid,0),{code:'ESRCH'});
  const store=createStore(db);try{const job=store.selectRecentJobs(1)[0];assert.equal(job.status,'interrupted');assert.equal(job.items[0].status,'pending');}finally{store.close();}
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createStore } from '../../src/core/store.js';
if(process.env.LIVE!=='1'||!process.env.LIVE_PLACE_URL)throw new Error('Use the opt-in test:live script with LIVE=1 and LIVE_PLACE_URL');
test('LIVE: signed-in production CLI collects 30 complete records', {timeout:180000},async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gmr-live-')),db=path.join(dir,'reviews.db');t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const child=spawn(process.execPath,['src/cli/index.js','run',process.env.LIVE_PLACE_URL,'--profile',process.env.LIVE_PROFILE??'default','--require-login','--headless','--limit','30','--db',db],{stdio:'inherit'});
  t.after(()=>child.kill('SIGTERM'));const [code]=await once(child,'exit');assert.equal(code,0);
  const store=createStore(db);try{const job=store.selectRecentJobs(1)[0];assert.equal(job.config.authState,'signed-in');assert.equal(store.countReviews(),30);assert.equal(job.status,'completed');assert.ok(store.selectReviews().every(r=>r.textTruncated!==1));assert.deepEqual(store.selectReviews().map(r=>r.feedRank).sort((a,b)=>a-b),Array.from({length:30},(_,i)=>i+1));}finally{store.close();}
});

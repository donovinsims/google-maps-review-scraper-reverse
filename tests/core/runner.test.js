import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { collectForPlaces } from '../../src/cli/runner.js';
import { createStore } from '../../src/core/store.js';
const url = n => `https://www.google.com/maps/place/Test${n}/data=!1s0x1:0x${n}`;
function setup(t) { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gmr-runner-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true })); return path.join(dir, 'test.db'); }
const result = (reason = 'no-more-reviews', n = 0) => ({ place: { placeId: '0x1:0x1', name: 'Test', reviewsCount: n, url: url(1) }, reviews: [], termination: { reason, authState: 'signed-in' }, diagnostics: {} });
function fakeCollector(reasons, stream = []) { return async (items, config, complete, onBatch) => {
  const summaries = [];
  for (const [i, item] of items.entries()) {
    if (config.signal.aborted) break;
    if (stream.length) await onBatch({ place: result().place, reviews: stream }, item.url, item.idx);
    summaries.push(await complete(result(reasons[i] ?? reasons[0], stream.length), item.url, item.idx, 1));
  }
  return summaries;
}; }
function readJob(db, id) { const s = createStore(db); try { return s.getJob(id); } finally { s.close(); } }

test('V1: real runner aggregates all failed, mixed, partial, blocked, zero-review outcomes', async t => {
  const db = setup(t);
  for (const [reasons, status, exitCode] of [[['failed','failed'],'failed',1], [['no-more-reviews','incomplete'],'partial',2], [['incomplete','timeout'],'partial',2], [['blocked','no-more-reviews'],'blocked',3], [['no-reviews','no-reviews'],'completed',0]]) {
    const run = await collectForPlaces({ listingUrls: [url(1), url(2)], db, delayMs: [0,0] }, { launchBatchCollector: fakeCollector(reasons) });
    assert.equal(run.status, status); assert.equal(run.exitCode, exitCode);
    assert.equal(readJob(db, run.jobId).status, status);
    for (const item of run.summary) for (const key of ['listingUrl','idx','placeId','placeName','status','collected','expected','termination','error','attempts','durationMs']) assert.ok(key in item, key);
  }
});
test('V2: invalid URLs fail without a browser launch or retries', async t => {
  let launched = false;
  const run = await collectForPlaces({ db: setup(t), listingUrls: ['not-a-url'] }, { launchBatchCollector: async () => { launched = true; } });
  assert.equal(launched, false); assert.equal(run.exitCode, 1); assert.equal(run.summary[0].termination.reason, 'invalid-url'); assert.equal(run.summary[0].attempts, 0);
});
test('S7: launch exceptions fail the job and close storage', async t => {
  const db = setup(t); let closes = 0;
  await assert.rejects(collectForPlaces({ listingUrls: [url(1)], db, jobId: 'launch-fail' }, {
    createStore(p) { const s = createStore(p); const close = s.close; s.close = () => { closes++; close(); }; return s; },
    launchBatchCollector: async () => { throw new Error('SingletonLock: profile in use'); },
  }), /profile in use/);
  assert.equal(closes, 1); assert.equal(readJob(db, 'launch-fail').status, 'failed');
});
test('V4: resume preserves original indices, duplicate URLs and saved options', async t => {
  const db = setup(t); const s = createStore(db);
  s.createJob({ id: 'resume', config: { listingUrls: [url(1),url(1),url(2)], limit: 30, language: 'de', sort: 'highest' }, totalPlaces: 3 });
  s.recordJobItem({ jobId: 'resume', idx: 0, inputUrl: url(1), status: 'done', termination: { reason: 'limit-reached' } }); s.close();
  const run = await collectForPlaces({ db, resume: 'resume', sort: 'newest' }, { launchBatchCollector: async (items, config, complete) => {
    assert.deepEqual(items.map(x => x.idx), [1,2]); assert.equal(config.limit,30); assert.equal(config.language,'de'); assert.equal(config.sort,'newest');
    return Promise.all(items.map(item => complete(result('no-reviews'), item.url, item.idx, 1)));
  } });
  assert.equal(run.status,'completed'); assert.equal(readJob(db,'resume').items[0].termination.reason, 'limit-reached');
  let launched = false;
  const again = await collectForPlaces({ db, resume:'resume' }, { launchBatchCollector: async () => { launched = true; } });
  assert.equal(again.exitCode, 0); assert.equal(launched,false);
});
test('V7: streamed limit is enforced before writes and final callbacks do not double count', async t => {
  const db = setup(t); const reviews = Array.from({length:8},(_,i)=>({reviewId:`r${i}`,rating:5}));
  const run = await collectForPlaces({ db, listingUrls:[url(1)], limit:3 }, { launchBatchCollector:fakeCollector(['limit-reached'],reviews) });
  const s=createStore(db); try { assert.equal(s.countReviews(),3); assert.ok(s.selectReviews().every(r=>r.collectedCount===1)); assert.equal(run.summary[0].collected,3); } finally {s.close();}
});
test('S13: stream write failure becomes persistence-error and never completed', async t => {
  const db=setup(t);
  const run=await collectForPlaces({db,listingUrls:[url(1)]},{ createStore(p){const s=createStore(p);s.upsertReviews=()=>{throw new Error('disk full');};return s;},
    launchBatchCollector:async(items,cfg,complete,onBatch)=>{ const item=items[0];try{await onBatch({place:result().place,reviews:[{reviewId:'r',rating:5}]},item.url,item.idx);}catch{} return [await complete(result('limit-reached'),item.url,item.idx,1)]; }});
  assert.equal(run.status,'failed'); assert.equal(run.summary[0].termination.reason,'persistence-error');
});
test('D: proxy credentials are absent from the stored job and error messages', async t => {
  const db=setup(t);const run=await collectForPlaces({ db, listingUrls:['invalid'],proxy:'http://alice:secret-password@example.com:8080' });
  assert.ok(!JSON.stringify(readJob(db,run.jobId)).includes('secret-password'));
});
test('V1: completion checkpoint exceptions cannot leave a job looking partial or successful',async t=>{
  const db=setup(t);const run=await collectForPlaces({db,listingUrls:[url(1)]},{
    createStore(p){const s=createStore(p),record=s.recordJobItem;s.recordJobItem=item=>{if(item.status==='done')throw new Error('checkpoint unavailable');return record(item);};return s;},
    launchBatchCollector:async(items,cfg,complete)=>{try{return [await complete(result('no-reviews'),items[0].url,0,1)];}catch(error){return [{listingUrl:items[0].url,idx:0,status:'failed',termination:{reason:'failed'},error:error.message,attempts:1,collected:0,expected:0}];}},
  });assert.equal(run.status,'failed');assert.equal(run.summary[0].status,'failed');
});
test('S7: empty fresh jobs fail rather than claiming completed',async t=>{
  const run=await collectForPlaces({db:setup(t),listingUrls:[]});assert.equal(run.status,'failed');assert.equal(run.exitCode,1);
});

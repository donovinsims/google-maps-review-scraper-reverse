import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createStore } from '../../src/core/store.js';
function setup(t) {const s=createStore(':memory:');t.after(()=>s.close());s.upsertBusinessMeta({placeId:'p',listingUrl:'https://google.com/maps/place/P'});return s;}
test('V7: v1 migrates to v2 idempotently without losing data', t => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gmr-migration-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const file=path.join(dir,'v1.db');
  const old=new DatabaseSync(file);old.exec(fs.readFileSync(new URL('../fixtures/synthetic/v1.sql',import.meta.url),'utf8'));
  old.exec("INSERT INTO businesses(placeId,listingUrl,firstSeenAt) VALUES('p','url','2020-01-01'); INSERT INTO reviews(placeId,reviewId,firstCollectedAt,lastCollectedAt) VALUES('p','r','2020-01-01','2020-01-01'); PRAGMA user_version=1;");old.close();
  for(let i=0;i<2;i++){const s=createStore(file);assert.equal(s.database.prepare('PRAGMA user_version').get().user_version,2);assert.equal(s.countReviews(),1);assert.equal(s.database.prepare('PRAGMA foreign_keys').get().foreign_keys,1);s.close();}
});
test('V3: only completed collections qualify for incremental skip and skips do not refresh expiry', t => {
  const s=setup(t);assert.equal(s.isPlaceCollected('p',7),false);const at=new Date(Date.now()-8*86400000).toISOString();
  s.markCompleted('p',at);assert.equal(s.isPlaceCollected('p',7),false);
  s.markCompleted('p',new Date().toISOString());assert.equal(s.isPlaceCollected('p',7),true);
  s.upsertBusinessMeta({placeId:'p',listingUrl:'url'});assert.equal(s.selectPlaces()[0].lastCompletedAt.slice(0,10),new Date().toISOString().slice(0,10));
});
test('V7: per-run counts, complete text preservation and shortened edits', t => {
  const s=setup(t);const r={placeId:'p',reviewId:'r',reviewText:'a full review',textTruncated:0};s.upsertReview(r,'a');s.upsertReview(r,'a');assert.equal(s.selectReviews()[0].collectedCount,1);
  s.upsertReview({...r,reviewText:'a…',textTruncated:1},'b');assert.equal(s.selectReviews()[0].reviewText,'a full review');assert.equal(s.selectReviews()[0].textTruncated,0);
  s.upsertReview({...r,reviewText:'short edit'},'c');assert.equal(s.selectReviews()[0].reviewText,'short edit');assert.equal(s.selectReviews()[0].collectedCount,3);
});
test('V6: reobserved date windows intersect; conflicts use the new window and are reported', t => {
  const s=setup(t);const base={placeId:'p',reviewId:'r',publishedDateEarliest:'2024-01-01T00:00:00.000Z',publishedDateLatest:'2025-01-01T00:00:00.000Z'};s.upsertReview(base,'a');
  s.upsertReview({...base,publishedDateEarliest:'2024-07-01T00:00:00.000Z',publishedDateLatest:'2025-07-01T00:00:00.000Z'},'b');let r=s.selectReviews()[0];assert.equal(r.publishedDateEarliest,'2024-07-01T00:00:00.000Z');assert.equal(r.publishedDateLatest,'2025-01-01T00:00:00.000Z');
  const outcome=s.upsertReview({...base,publishedDateEarliest:'2026-01-01T00:00:00.000Z',publishedDateLatest:'2026-02-01T00:00:00.000Z'},'c');assert.ok(outcome.conflicts.includes('publishedDate'));assert.equal(s.selectReviews()[0].publishedDateEarliest,'2026-01-01T00:00:00.000Z');
});
test('V4: changing a job item URL for its index throws and initial pending indices retain duplicates', t=>{
  const s=setup(t);s.createJob({id:'j',config:{listingUrls:['a','a','b']},totalPlaces:3});assert.equal(s.getJob('j').items.length,3);
  assert.throws(()=>s.recordJobItem({jobId:'j',idx:1,inputUrl:'other'}),/inputUrl|URL/);
});
test('D: listing URLs are required, delete removes job references, ordering has deterministic ties', t=>{
  const s=setup(t);assert.throws(()=>s.upsertBusinessMeta({placeId:'missing'}),/listingUrl/);
  for(const reviewId of ['c','a','b'])s.upsertReview({placeId:'p',reviewId},'a');assert.deepEqual(s.selectReviews().map(r=>r.reviewId),['a','b','c']);assert.deepEqual(s.selectReviews({limit:1,offset:1}).map(r=>r.reviewId),['b']);
  s.createJob({id:'j',config:{listingUrls:['url']},totalPlaces:1});s.recordJobItem({jobId:'j',idx:0,inputUrl:'url',placeId:'p'});s.deleteReviews('p');assert.equal(s.getJob('j').items.length,0);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { launchBatchCollector } from '../../src/collector/batch.js';
const url='https://www.google.com/maps/place/Test/data=!1s0x1:0x1';
function harness({ reasons=['no-reviews'], throwFirst=false }={}) {
  const calls={pages:0,closedPages:0,contexts:0,closedContexts:0,browserClosed:0,gotos:0,scrapes:0};
  const context={pages:()=>[],newPage:async()=>{calls.pages++;return {close:async()=>{calls.closedPages++;},goto:async()=>{calls.gotos++;},isClosed:()=>false};},close:async()=>{calls.closedContexts++;}};
  const browser={newContext:async()=>{calls.contexts++;return context;},close:async()=>{calls.browserClosed++;}};
  const chromium={launch:async()=>browser,launchPersistentContext:async()=>context,executablePath:()=>'/unused'};
  return {calls,deps:{chromium,hasSavedProfile:()=>false,sleep:async()=>{},detectAuthState:async()=> 'anonymous',scrapePlaceReviews:async(page,input,onProgress)=>{
    calls.scrapes++;if(throwFirst&&calls.scrapes===1){await page.goto(url);throw new Error('net::ERR_CONNECTION_RESET');}
    await page.goto(url);await onProgress('page-batch',{fresh:0});return {place:{placeId:'0x1:0x1',reviewsCount:0},reviews:[],termination:{reason:reasons[Math.min(calls.scrapes-1,reasons.length-1)]},diagnostics:{}};
  }}};
}
test('V1: thrown URLs and throwing completion callbacks always have explicit failed summaries', async()=>{
  const h=harness();h.deps.scrapePlaceReviews=async()=>{throw new Error('ordinary fatal error');};
  const items=await launchBatchCollector([{url,idx:7}],{profile:false,delayMs:[0,0]},async()=>{throw new Error('callback failed');},async()=>{},h.deps);
  assert.equal(items[0].status,'failed');assert.equal(items[0].idx,7);assert.equal(items[0].attempts,1);assert.equal(h.calls.browserClosed,1);
});
test('S5: transient retries have fresh pages, navigate again, record attempts and close resources', async()=>{
  const h=harness({throwFirst:true});const items=await launchBatchCollector([{url,idx:0}],{profile:false,delayMs:[0,0]},async(r,u,idx,attempts)=>({status:'done',collected:0,attempts}),async()=>{},h.deps);
  assert.equal(items[0].attempts,2);assert.equal(h.calls.pages,2);assert.equal(h.calls.closedPages,2);assert.equal(h.calls.gotos,2);assert.equal(h.calls.browserClosed,1);
});
test('S12: two consecutive blocks stop scheduling and do not retry blocked results', async()=>{
  const h=harness({reasons:['blocked','captcha']});const items=await launchBatchCollector([0,1,2].map(idx=>({url,idx})),{profile:false,delayMs:[0,0]},async()=>({status:'blocked',collected:0}),async()=>{},h.deps);
  assert.equal(items.length,2);assert.equal(h.calls.scrapes,2);
});
test('S13: awaited stream callback errors fail the item',async()=>{
  const h=harness();h.deps.scrapePlaceReviews=async(page,input,onProgress)=>{await onProgress('stream-batch',{reviews:[]});throw new Error('must not reach');};
  const items=await launchBatchCollector([{url,idx:0}],{profile:false,delayMs:[0,0]},async r=>({status:r.termination.reason==='persistence-error'?'failed':'done',collected:0}),async()=>{throw new Error('disk full');},h.deps);
  assert.equal(items[0].status,'failed');assert.equal(items[0].termination.reason,'persistence-error');
});
test('S5: a closed context while creating a page is rebuilt before retrying',async()=>{
  const h=harness();let first=true;
  const originalLaunch=h.deps.chromium.launch;
  h.deps.chromium.launch=async opts=>{const browser=await originalLaunch(opts);const originalNew=browser.newContext;browser.newContext=async options=>{const context=await originalNew(options);const originalPage=context.newPage;context.newPage=async()=>{if(first){first=false;throw new Error('Target page, context or browser has been closed');}return originalPage();};return context;};return browser;};
  const items=await launchBatchCollector([{url,idx:0}],{profile:false,delayMs:[0,0]},async(r,u,idx,attempts)=>({status:'done',collected:0,attempts}),async()=>{},h.deps);
  assert.equal(items[0].status,'done');assert.equal(items[0].attempts,2);
});
test('S11: persistent profiles clamp concurrency unless unsafe concurrency is explicit',async()=>{
  const fs=await import('node:fs'),os=await import('node:os'),path=await import('node:path');const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gmr-concurrency-'));
  try{for(const unsafeConcurrency of [false,true]){const h=harness();h.deps.projectRoot=dir;h.deps.hasSavedProfile=()=>true;let active=0,peak=0;
    h.deps.scrapePlaceReviews=async()=>{active++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,10));active--;return {place:null,reviews:[],termination:{reason:'no-reviews'}};};
    await launchBatchCollector([0,1].map(idx=>({url,idx})),{concurrency:2,unsafeConcurrency,delayMs:[0,0]},async()=>({status:'done',collected:0}),async()=>{},h.deps);
    assert.equal(peak,unsafeConcurrency?2:1);
  }}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('S3: require-login refuses anonymous state with usage exit 64 and closes the browser',async()=>{
  const h=harness();await assert.rejects(launchBatchCollector([{url,idx:0}],{profile:false,requireLogin:true},undefined,undefined,h.deps),e=>e.exitCode===64);assert.equal(h.calls.browserClosed,1);
});
test('S5: a closed persistent context while creating a page is rebuilt before retrying',async()=>{
  const fs=await import('node:fs'),os=await import('node:os'),path=await import('node:path');const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gmr-rebuild-'));
  try{
    const h=harness();h.deps.projectRoot=dir;h.deps.hasSavedProfile=()=>true;let launches=0,first=true;
    h.deps.chromium.launchPersistentContext=async()=>{
      launches++;
      return {pages:()=>[],newPage:async()=>{if(first){first=false;throw new Error('Target page, context or browser has been closed');}return {close:async()=>{},goto:async()=>{},isClosed:()=>false};},close:async()=>{}};
    };
    const items=await launchBatchCollector([{url,idx:0}],{profile:'default',delayMs:[0,0]},async(r,u,idx,attempts)=>({status:'done',collected:0,attempts}),async()=>{},h.deps);
    assert.equal(items[0].status,'done');assert.equal(items[0].attempts,2);assert.equal(launches,2);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('S7: workers are joined and settled even when a worker throws unexpectedly',async()=>{
  const h=harness();let completedCount=0;
  h.deps.scrapePlaceReviews=async(page,input)=>{
    if(input.url.includes('throw'))throw new Error('fatal crash');
    await new Promise(r=>setTimeout(r,20));
    return {place:{placeId:'0x1:0x1',reviewsCount:0},reviews:[],termination:{reason:'no-reviews'},diagnostics:{}};
  };
  const items=[{url:url+'-throw',idx:0},{url:url+'-ok',idx:1}];
  const res=await launchBatchCollector(items,{concurrency:2,profile:false,delayMs:[0,0]},async r=>{completedCount++;return {status:r.termination.reason==='failed'?'failed':'done',idx:r.idx};},async()=>{},h.deps);
  assert.equal(res.length,2);assert.equal(completedCount,2);assert.equal(res[0].status,'failed');assert.equal(res[1].status,'done');
});

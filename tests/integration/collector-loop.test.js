import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseHTML } from 'linkedom';
import { scrapePlaceReviews } from '../../src/collector/place-reviews.js';
const URL='https://www.google.com/maps/place/Test/data=!1s0x1:0x2';
const card=(id,body='Body')=>`<div class="jftiEf" data-review-id="${id}"><span data-reviewer-name>Fixture</span><span role="img" aria-label="5 stars"></span><span data-review-date>2 days ago</span><span data-review-text>${body}</span></div>`;
class Locator {
  constructor(page,selector,nodes=null){this.page=page;this.selector=selector;this.fixed=nodes;}
  nodes(){return this.fixed??[...this.page.document.querySelectorAll(this.selector)];}
  first(){return new Locator(this.page,this.selector,this.nodes().slice(0,1));}
  nth(n){return new Locator(this.page,this.selector,this.nodes().slice(n,n+1));}
  filter({hasText}){return new Locator(this.page,this.selector,this.nodes().filter(n=>hasText.test(n.textContent)));}
  async count(){return this.nodes().length;}
  async click(){const n=this.nodes()[0];if(!n)throw new Error('no matching control');this.page.clicks++;n.click();}
  async getAttribute(name){const n=this.nodes()[0];if(!n)throw new Error('no matching node');return n.getAttribute(name);}
  async textContent(){return this.nodes()[0]?.textContent??null;}
}
class Page {
  constructor(html,{wheel=()=>{}}={}){this.document=parseHTML(`<html><body>${html}</body></html>`).document;this.current='about:blank';this.clicks=0;this.navigations=0;this.screenshots=0;this.mouse={wheel:async()=>wheel(this)};}
  url(){return this.current;}
  async goto(url){this.current=url;this.navigations++;}
  locator(selector){return new Locator(this,selector);}
  getByRole(role,{name}){return new Locator(this,'button',[...this.document.querySelectorAll('button')].filter(n=>name.test(n.textContent)));}
  async evaluate(fn,arg){const old=globalThis.document;globalThis.document=this.document;try{return fn(arg);}finally{globalThis.document=old;}}
  async waitForSelector(selector){if(!this.document.querySelector(selector))throw new Error('missing');}
  async waitForURL(){}
  async screenshot(){this.screenshots++;}
  on(){} off(){}
}
function options(t,extra={}){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gmr-loop-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));let clock=Date.UTC(2026,9,30);return {url:URL,sortMode:'default',language:{hl:'en',gl:'us'},overrides:{authState:'signed-in',sleep:async ms=>{clock+=ms;},now:()=>clock,scrollIdleMs:1,stallTimeoutMs:5,placeIdWaitMs:1,diagnosticsDir:dir,...extra}};}
test('S3: production loop reports anonymous cap without an English banner',async t=>{
  const page=new Page(`<h1>Test</h1><button role="tab" aria-label="Reviews (300)">Reviews</button>${card('a')}${card('b')}`);
  const result=await scrapePlaceReviews(page,options(t,{authState:'anonymous'}));assert.equal(result.termination.reason,'anonymous-preview-limit');assert.equal(result.reviews.length,2);assert.equal(page.screenshots,1);
});
test('S2: production loop persists a strict limit in one pass, including ranks',async t=>{
  const page=new Page(`<h1>Test</h1><button role="tab" aria-label="Reviews (100)">Reviews</button>${card('a')}${card('b')}${card('c')}`),batches=[];
  const result=await scrapePlaceReviews(page,{...options(t),maxReviews:2},async(event,data)=>{if(event==='stream-batch')batches.push(data.reviews);});
  assert.equal(result.termination.reason,'limit-reached');assert.equal(batches.flat().length,2);assert.deepEqual(result.reviews.map(r=>r.feedRank),[1,2]);assert.equal(page.navigations,1);
});
test('S6: unverifiable explicit sort fails twice and persists nothing',async t=>{
  const page=new Page(`<h1>Test</h1><button aria-label="Sort reviews">Sort</button><div role="menuitemradio">Newest</div>${card('a')}`);let streams=0;
  const result=await scrapePlaceReviews(page,{...options(t),sortMode:'newest'},async e=>{if(e==='stream-batch')streams++;});assert.equal(result.termination.reason,'sort-failed');assert.equal(streams,0);assert.equal(result.reviews.length,0);assert.equal(page.clicks,4);
});
test('S6: a requested sort is never attempted when no review cards have loaded',async t=>{
  const page=new Page(`<h1>Test</h1><button role="tab" aria-label="Reviews (300)">Reviews</button><button aria-label="Sort reviews">Sort</button>`);
  const result=await scrapePlaceReviews(page,{...options(t),sortMode:'newest'});
  assert.equal(page.clicks,1);assert.equal(result.diagnostics.sortApplied,null);assert.equal(result.reviews.length,0);
  assert.equal(result.termination.reason,'structure-unknown');
});
test('S9: structure drift names the failing field and does not report success',async t=>{
  const page=new Page('<h1>Test</h1><div data-review-id="broken"><span>Changed markup</span></div>');const result=await scrapePlaceReviews(page,options(t));assert.equal(result.termination.reason,'structure-drift');assert.match(result.termination.detail,/reviewerName/);assert.equal(result.diagnostics.fieldCoverage.rating,0);
});
test('S12: mid-pagination CAPTCHA iframe is detected and stops collection',async t=>{
  const page=new Page(`<h1>Test</h1>${card('a')}`,{wheel:p=>{p.document.body.insertAdjacentHTML('beforeend','<iframe src="https://google.com/recaptcha"></iframe>');}});
  const result=await scrapePlaceReviews(page,options(t));assert.equal(result.termination.reason,'captcha');assert.equal(result.reviews.length,1);
});
test('S8: consent form failure has its own reason and diagnostic capture',async t=>{
  const page=new Page('<form action="https://consent.google.com/save"></form>');const result=await scrapePlaceReviews(page,options(t));assert.equal(result.termination.reason,'consent-wall');assert.equal(page.screenshots,1);
});
test('S2: zero reviews require positive evidence rather than missing cards',async t=>{
  const zero=new Page('<h1>Test</h1><button role="tab" aria-label="Reviews (0)">Reviews</button>');assert.equal((await scrapePlaceReviews(zero,options(t))).termination.reason,'no-reviews');
  const empty=new Page('<h1>Test</h1>');assert.notEqual((await scrapePlaceReviews(empty,options(t))).termination.reason,'no-reviews');
});
test('S3: anonymous overview scrolls the place panel to load previews and never clicks review-disclosure controls',async t=>{
  const page=new Page('<div id="panel"><h1>Test</h1><button aria-label="Learn more about legal disclosure regarding public reviews on Google Maps">Info</button></div>');
  const panel=page.document.querySelector('#panel');let top=0;
  Object.defineProperties(panel,{scrollHeight:{get:()=>2000},clientHeight:{get:()=>500},scrollTop:{get:()=>top,set:value=>{top=value;if(value>0&&!panel.querySelector('[data-review-id]'))panel.insertAdjacentHTML('beforeend','<button aria-label="More reviews (300)">More reviews</button>'+card('a'));}}});
  const result=await scrapePlaceReviews(page,options(t,{authState:'anonymous'}));assert.equal(result.reviews.length,1);assert.equal(result.termination.reason,'anonymous-preview-limit');assert.equal(page.clicks,0);
});
test('S3: anonymous limited-view place panel with zero cards classifies as anonymous-preview-limit',async t=>{
  const page=new Page('<h1>Test</h1><button role="tab">Overview</button><button role="tab">About</button>');
  const result=await scrapePlaceReviews(page,options(t,{authState:'anonymous'}));
  assert.equal(result.termination.reason,'anonymous-preview-limit');
  assert.equal(result.reviews.length,0);
  assert.match(result.termination.detail,/Anonymous preview limited/i);
});

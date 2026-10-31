import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'rebrowser-playwright';
import { launchWithFallback, authSignalsInPage } from '../../src/collector/browser.js';

test('S10: launch uses real identity, requested locale, and no spoofing flags',async()=>{
  let options;const resource={};const chromium={launch:async opts=>{options=opts;return resource;}};
  const launched=await launchWithFallback(chromium,null,{headless:true,language:'de'});
  assert.equal(launched.resource,resource);assert.equal(options.channel,'chrome');assert.equal(options.locale,'de');assert.ok(options.args.includes('--lang=de'));
  for(const key of ['userAgent','timezoneId'])assert.equal(options[key],undefined);
  assert.ok(!options.args.some(a=>/AutomationControlled/.test(a)));
});
test('S10: browser availability errors fall back; profile locks never do',async()=>{
  const channels=[];const chromium={executablePath:()=>'/bundled',launch:async opts=>{channels.push(opts.channel);if(opts.channel)throw new Error('Chrome distribution not found');return {};}};
  await launchWithFallback(chromium,null,{language:'en'},{existsSync:()=>true});assert.deepEqual(channels,['chrome',undefined]);
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gmr-profile-'));try{let launches=0;await assert.rejects(launchWithFallback({launchPersistentContext:async()=>{launches++;throw new Error('SingletonLock: profile in use');}},dir,{language:'en'}),/Profile is in use/);assert.equal(launches,1);}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('S3: authentication requires positive account UI evidence, unknown is preserved',()=>{
  const previous=globalThis.document;
  try{for(const [html,state] of [['<a aria-label="Google Account: test"></a>','signed-in'],['<a href="https://accounts.google.com/ServiceLogin">Sign in</a>','anonymous'],['<main>Map</main>','unknown']]){
    globalThis.document=parseHTML(html).document;assert.equal(authSignalsInPage().authState,state);
  }}finally{globalThis.document=previous;}
});
test('S3: openLogin navigates to valid login URL with continue parameter',async()=>{
  const { openLogin } = await import('../../src/collector/browser.js');
  const urls=[];
  const mockPage={goto:async url=>{urls.push(url);},evaluate:async()=>({insecureBrowser:false,authState:'anonymous'}),close:async()=>{},waitForFunction:async()=>{}};
  const mockContext={pages:()=>[mockPage],newPage:async()=>mockPage,once:(evt,cb)=>{if(evt==='close')setTimeout(cb,10);},off:()=>{},close:async()=>{}};
  const fs=await import('node:fs'),os=await import('node:os');
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gmr-login-'));
  try{
    const origLaunch=chromium.launchPersistentContext;
    chromium.launchPersistentContext=async()=>mockContext;
    try{
      await openLogin({projectRoot:dir,language:'en',region:'us'});
      assert.ok(urls.some(u=>/accounts\.google\.com\/ServiceLogin\?continue=.*google\.com%2Fmaps/.test(u)));
      assert.ok(!urls.some(u=>/service=maps/.test(u)));
    }finally{chromium.launchPersistentContext=origLaunch;}
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

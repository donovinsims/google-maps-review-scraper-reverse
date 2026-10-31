import { test } from 'node:test';
import assert from 'node:assert/strict';
import { redact } from '../../src/core/redact.js';
import { createStore } from '../../src/core/store.js';
test('D: redaction covers proxy URLs, JSON headers, cookie strings and known credential values',()=>{
  const input={proxy:'http://alice:p%40ss@proxy.test:8080',headers:{Authorization:'Bearer hidden',Cookie:'SID=hidden'},message:'{"password":"p@ss","Authorization":"Bearer hidden"}',plain:'connection rejected p@ss'};
  const output=JSON.stringify(redact(input,['p@ss']));assert.ok(!output.includes('p%40ss'));assert.ok(!output.includes('p@ss'));assert.ok(!output.includes('Bearer hidden'));assert.ok(!output.includes('SID=hidden'));
});
test('D: invalid credentialed input URLs cannot leak through job item persistence',()=>{
  const store=createStore(':memory:');try{store.createJob({id:'j',config:{listingUrls:['https://alice:password123@google.com/maps/place/Test']}});assert.ok(!JSON.stringify(store.getJob('j')).includes('password123'));}finally{store.close();}
});

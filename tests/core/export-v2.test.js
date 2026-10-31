import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { toCsv, toJsonExport, EXPORT_COLUMNS, writeExport } from '../../src/export/exporters.js';
test('V8: empty CSV has fixed headers and CRLF; file BOM is explicit',()=>{
  assert.equal(toCsv([]),EXPORT_COLUMNS.join(',')+'\r\n');assert.ok(toCsv([] ,undefined,{bom:true}).startsWith('\uFEFF'));
  assert.equal(toCsv([{rating:-1,reviewText:'=cmd',translatedByGoogle:1}],['rating','reviewText','translatedByGoogle']),"rating,reviewText,translatedByGoogle\r\n-1,'=cmd,true\r\n");
});
test('V8: guard only string formula prefixes; raw opt-out, boolean and Unicode exports',()=>{
  for(const prefix of ['=','+','-','@','\t','\r'])assert.ok(toCsv([{x:prefix+'hello'}],['x']).includes("'"+prefix+'hello'));
  assert.ok(!toCsv([{x:'=hello'}],['x'],{raw:true}).includes("'=hello"));assert.ok(toCsv([{reviewText:'中文 🚀, "é"'}]).includes('"中文 🚀, ""é"""'));
});
test('V8: JSON is version 2 with columns and atomic writes leave no temp files',t=>{
  const j=JSON.parse(toJsonExport([{reviewId:'r'}]));assert.equal(j.schemaVersion,2);assert.deepEqual(j.columns,EXPORT_COLUMNS);
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gmr-export-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const file=path.join(dir,'a.csv');writeExport(file,'old');writeExport(file,'new');assert.equal(fs.readFileSync(file,'utf8'),'new');assert.deepEqual(fs.readdirSync(dir),['a.csv']);
});

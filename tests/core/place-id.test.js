import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractPlaceId } from '../../src/core/place-id.js';
test('S4: feature ID extraction supports direct, encoded and settled share/search URLs',()=>{
  for(const url of ['https://google.com/maps/place/P/data=!1s0x123:0x456!8m2','https://google.com/maps/place/P/data=%211s0x123%3A0x456%218m2','https://google.com/maps/search/P/data=!1s0x123:0x456'])assert.equal(extractPlaceId(url),'0x123:0x456');
  assert.equal(extractPlaceId('https://maps.app.goo.gl/share'),null);assert.equal(extractPlaceId('https://google.com/maps/place/P'),null);
});

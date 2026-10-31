import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseHTML } from 'linkedom';
import { extractInPage, expandInPage, pickPlaceRatingInPage } from '../../src/collector/place-reviews.js';
import { SELECTORS } from '../../src/collector/selectors.js';
import { normalizeRating } from '../../src/core/normalize.js';
const fixture=name=>parseHTML(fs.readFileSync(new URL(`../fixtures/synthetic/${name}.html`,import.meta.url),'utf8')).document;
const extract=card=>extractInPage({card,selectors:SELECTORS}).reviews[0];
test('V5: rating-only review never acquires its owner reply as review text',()=>{
  const r=extract(fixture('rating-only-owner').querySelector('[data-review-id]'));
  assert.equal(r.reviewText,null);assert.equal(r.ownerResponse,'Thanks for your rating!');assert.equal(r.ownerResponseDateRaw,'a week ago');assert.equal(r.publishedDateRaw,'a month ago');assert.equal(r.rating,5);
});
test('S1: review and owner text exclude buttons and preserve explicit truncation',()=>{
  const r=extract(fixture('truncated').querySelector('[data-review-id]'));
  assert.equal(r.reviewText,'Long review…');assert.equal(r.ownerResponse,'Long reply…');assert.equal(r.textTruncated,1);assert.ok(!r.reviewText.includes('More'));assert.equal(r.publishedDateRaw,'Edited 3 months ago');
});
test('S1: expansion clicks all eligible buttons even when they remove themselves; menus stay untouched',()=>{
  const document=fixture('truncated'),card=document.querySelector('[data-review-id]');let clicks=0;
  for(const button of card.querySelectorAll('.w8nwRe'))button.addEventListener('click',()=>{button.parentElement.firstChild.textContent='Expanded text ';button.remove();clicks++;});
  const previous=globalThis.document;globalThis.document=document;try{assert.equal(expandInPage({selectors:SELECTORS}),2);assert.equal(expandInPage({selectors:SELECTORS}),0);}finally{globalThis.document=previous;}
  assert.equal(clicks,2);assert.ok(card.querySelector('button[aria-label="More"]'));assert.equal(extract(card).textTruncated,0);
});
test('S9: Unicode, RTL, translations, missing author/date stay accurate and null',()=>{
  const r=extract(fixture('translated').querySelector('[data-review-id]'));assert.equal(r.reviewText,'رائع 🚀 中文 é');assert.equal(r.translatedByGoogle,true);assert.equal(r.originalLanguage,'ar');
  const empty=extract(parseHTML('<div data-review-id="empty"><span role="img" aria-label="5 stars"></span></div>').document.querySelector('div'));assert.equal(empty.reviewerName,null);assert.equal(empty.publishedDateRaw,null);
});
test('S9: extraction filters seen IDs and takes the limit before returning plain records',()=>{
  const document=parseHTML('<div data-review-id="a"></div><div data-review-id="b"></div><div data-review-id="c"></div>').document;
  const previous=globalThis.document;globalThis.document=document;try{const out=extractInPage({selectors:SELECTORS,seenIds:['a'],maxRecords:1});assert.deepEqual(out.reviews.map(r=>r.reviewId),['b']);assert.equal(out.cardCount,3);assert.ok(JSON.stringify(out).includes('fieldCoverage'));}finally{globalThis.document=previous;}
});
test('S1: nested data-review-id duplicates are reduced to the outermost card when both match the card selector',()=>{
  const document=parseHTML(`<div class="jftiEf" data-review-id="a"><span data-reviewer-name>A</span><span role="img" aria-label="5 stars"></span><span data-review-date>2 days ago</span><span data-review-text>Body</span><div class="jftiEf" data-review-id="a-inner"></div></div>`).document;
  const previous=globalThis.document;globalThis.document=document;
  try{const out=extractInPage({selectors:SELECTORS});assert.equal(out.cardCount,1);assert.deepEqual(out.reviews.map(r=>r.reviewId),['a']);assert.equal(out.reviews[0].reviewText,'Body');}
  finally{globalThis.document=previous;}
});
test('S1: the bare data-review-id fallback collects cards the specific selector misses, still outermost-only',()=>{
  const document=parseHTML(`<div data-review-id="a"><span data-reviewer-name>A</span><span role="img" aria-label="5 stars"></span><span data-review-date>2 days ago</span><span data-review-text>Body</span><div data-review-id="a-inner"><div data-review-id="a-deep"></div></div></div><div data-review-id="b" class="not-card"><span data-reviewer-name>B</span><span role="img" aria-label="4 stars"></span><span data-review-date>3 days ago</span><span data-review-text>Body</span></div><button data-review-id="btn"></button>`).document;
  const previous=globalThis.document;globalThis.document=document;
  try{const out=extractInPage({selectors:SELECTORS});assert.equal(out.cardCount,2);assert.deepEqual(out.reviews.map(r=>r.reviewId),['a','b']);assert.equal(out.reviews[0].reviewText,'Body');assert.equal(out.reviews[0].rating,5);}
  finally{globalThis.document=previous;}
});
test('S1: discarded nested wrapper text does not leak into the outer card record',()=>{
  const document=parseHTML(`<div data-review-id="a"><span data-reviewer-name>A</span><span role="img" aria-label="5 stars"></span><span data-review-date>2 days ago</span><span data-review-text>Body</span><div data-review-id="a-inner"><span data-review-text>WRONG</span></div></div>`).document;
  const previous=globalThis.document;globalThis.document=document;
  try{const out=extractInPage({selectors:SELECTORS});assert.equal(out.reviews.length,1);assert.equal(out.reviews[0].reviewText,'Body');}
  finally{globalThis.document=previous;}
});
test('S9: each ordered field selector has a synthetic fixture exercising that exact strategy',()=>{
  const fields={rating:['<span role="img" aria-label="5 stars"></span>','<span role="img" aria-label="5 Sterne"></span>','<span class="kvMYJc" aria-label="5 stars"></span>','<span class="fzvQIb" aria-label="5 stars"></span>'],reviewerName:['<span data-reviewer-name>Author</span>','<span class="d4r55">Author</span>','<button data-href="https://google.com/maps/contrib/x">Author</button>','<a href="https://google.com/maps/contrib/x">Author</a>'],reviewText:['<span data-review-text>Body</span>','<span data-review-body>Body</span>','<div class="MyEned"><span class="wiI7pd">Body</span></div>','<span class="wiI7pd">Body</span>'],publishedDateRaw:['<span data-review-date>2 days ago</span>','<time>2 days ago</time>','<span class="rsqaWe">2 days ago</span>'],ownerResponse:['<div data-owner-response><span data-review-text>Reply</span></div>','<div aria-label="Response from the owner"><span data-review-text>Reply</span></div>','<div class="CDe7pd"><span class="wiI7pd">Reply</span></div>']};
  for(const [field,fragments] of Object.entries(fields)){assert.equal(fragments.length,SELECTORS[field].length,field);for(const [i,html] of fragments.entries()){const card=parseHTML(`<div data-review-id="id">${html}</div>`).document.querySelector('div');const r=extract(card);assert.notEqual(r[field],null,`${field} strategy ${i}: ${SELECTORS[field][i]}`);}}
});
test('S9: place rating fallbacks do not read a review count as a rating',()=>{
  for(const html of ['<span data-place-rating>4.3</span>','<div class="F7nice"><span role="img" aria-label="4.3 stars"></span></div>','<div class="F7nice"><span aria-hidden="true">4,3</span></div>','<span class="fontDisplayLarge">4.3</span>']){
    const previous=globalThis.document;globalThis.document=parseHTML(html).document;try{assert.equal(pickPlaceRatingInPage({selectors:SELECTORS}),4.3);}finally{globalThis.document=previous;}
  }
  assert.equal(normalizeRating('Reviewed 4 times').rating,null);assert.equal(normalizeRating('5.8 stars').rating,null);
});
test('S2: review-count chips ("mentioned in N reviews") do not match the More-reviews trigger selector',()=>{
  const document=parseHTML(`<html><body>
  <button aria-label="salmon tartine, mentioned in 38 reviews"></button>
  <button aria-label="Reviews for Tartine Manufactory"></button>
  <button aria-label="More reviews (300)"></button>
  <button aria-label="More reviews"></button>
  <button aria-label="Weitere Rezensionen (300)"></button>
  <button aria-label="Sort by number of reviews"></button>
  </body></html>`).document;
  const matched=[...document.querySelectorAll(SELECTORS.moreReviews)].map(n=>n.getAttribute('aria-label'));
  assert.deepEqual(matched,['More reviews (300)','More reviews','Weitere Rezensionen (300)']);
});
test('S2: search-result and review-body end-marker text do not prove review exhaustion',async()=>{
  const {readSurfaceInPage}=await import('../../src/collector/place-reviews.js');
  const old=globalThis.document;
  try{globalThis.document=parseHTML(`<html><body><div role="feed"><span>You've reached the end of the list.</span></div><div role="feed"><div data-review-id="r"><span data-review-text>You've reached the end of the list.</span></div></div></body></html>`).document;
    assert.equal(readSurfaceInPage({selectors:SELECTORS}).endMarkerSeen,false);
  }finally{globalThis.document=old;}
});

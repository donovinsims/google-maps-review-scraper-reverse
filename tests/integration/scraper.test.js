import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractInPage } from '../../src/collector/place-reviews.js';

function createMockElement({ tag = 'div', attrs = {}, text = '', children = [] } = {}) {
  return {
    tagName: tag.toUpperCase(),
    textContent: text || children.map(c => c.textContent).join(' '),
    getAttribute(name) {
      return attrs[name] ?? null;
    },
    hasAttribute(name) {
      return name in attrs;
    },
    querySelector(selector) {
      return this.querySelectorAll(selector)[0] || null;
    },
    querySelectorAll(selector) {
      const matches = [];
      const selectors = selector.split(',').map(s => s.trim());

      const testElement = (el) => {
        for (const s of selectors) {
          if (s.startsWith('.') && el.getAttribute('class')?.split(' ').includes(s.slice(1))) {
            return true;
          }
          if (s.startsWith('span.') && el.tagName === 'SPAN' && el.getAttribute('class')?.split(' ').includes(s.slice(5))) {
            return true;
          }
          if (s.startsWith('[data-is-english-language-translation]') && el.hasAttribute('data-is-english-language-translation')) {
            return true;
          }
          if (s.startsWith('button[data-href*="contrib/"]') && el.tagName === 'BUTTON' && el.getAttribute('data-href')?.includes('contrib/')) {
            return true;
          }
          if (s.startsWith('a[href*="contrib/"]') && el.tagName === 'A' && el.getAttribute('href')?.includes('contrib/')) {
            return true;
          }
        }
        return false;
      };

      const walk = (node) => {
        for (const child of node.children) {
          if (testElement(child)) {
            matches.push(child);
          }
          walk(child);
        }
      };

      walk({ children });
      return matches;
    },
    children,
  };
}

test('extractInPage parses standard review card accurately', () => {
  const card = createMockElement({
    attrs: { 'data-review-id': 'ChZDSUhNMG9nS0VJQ0FnSUNBeU9uUG5BEAE', 'data-review-language': 'en' },
    children: [
      createMockElement({ tag: 'span', attrs: { class: 'kvMYJc', 'aria-label': '5 stars' } }),
      createMockElement({ tag: 'div', attrs: { class: 'd4r55' }, text: 'Alice Walker' }),
      createMockElement({ tag: 'div', attrs: { class: 'wiI7pd' }, text: 'Exceptional experience and fresh ingredients.' }),
      createMockElement({ tag: 'span', attrs: { class: 'rsqaWe' }, text: 'a week ago' }),
      createMockElement({ tag: 'a', attrs: { href: 'https://www.google.com/maps/contrib/100123/reviews' } }),
    ],
  });

  const parsed = extractInPage(card);
  assert.equal(parsed.reviewId, 'ChZDSUhNMG9nS0VJQ0FnSUNBeU9uUG5BEAE');
  assert.equal(parsed.originalLanguage, 'en');
  assert.equal(parsed.reviewerName, 'Alice Walker');
  assert.equal(parsed.rating, 5);
  assert.equal(parsed.reviewText, 'Exceptional experience and fresh ingredients.');
  assert.equal(parsed.publishedDateRaw, 'a week ago');
  assert.equal(parsed.reviewerProfileUrl, 'https://www.google.com/maps/contrib/100123/reviews');
});

test('extractInPage handles rating-only review without text', () => {
  const card = createMockElement({
    attrs: { 'data-review-id': 'rev-rating-only' },
    children: [
      createMockElement({ tag: 'span', attrs: { class: 'kvMYJc', 'aria-label': '4 stars' } }),
      createMockElement({ tag: 'div', attrs: { class: 'd4r55' }, text: 'Bob S.' }),
    ],
  });

  const parsed = extractInPage(card);
  assert.equal(parsed.reviewId, 'rev-rating-only');
  assert.equal(parsed.rating, 4);
  assert.equal(parsed.reviewText, null);
  assert.equal(parsed.ownerResponse, null);
});

test('extractInPage handles translated review', () => {
  const card = createMockElement({
    attrs: { 'data-review-id': 'rev-translated' },
    children: [
      createMockElement({ tag: 'span', attrs: { class: 'NTyMbe', 'data-is-english-language-translation': 'true' } }),
      createMockElement({ tag: 'span', attrs: { class: 'kvMYJc', 'aria-label': '5 stars' } }),
    ],
  });

  const parsed = extractInPage(card);
  assert.equal(parsed.translatedByGoogle, true);
});

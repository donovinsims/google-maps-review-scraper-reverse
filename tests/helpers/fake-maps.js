// Offline Google-Maps-like fixture served through Playwright request interception.
// No network: every https://www.google.com/maps/** request is fulfilled locally.
import { chromium } from 'rebrowser-playwright';

export const PLACE_URL = 'https://www.google.com/maps/place/Test+Place/@42.28,-89.02,17z/data=!3m1!4b1!4m6!3m5!1s0x1111:0x2222!8m2!3d42.28!4d-89.02';

export function fakeMapsHtml(opts = {}) {
  const o = {
    name: 'Test Place', total: 30, batch: 10, gapMs: 0, sortable: false, sortRenderMs: 2000,
    limitedView: false, emptyPlace: false, reviewsCount: null, cards: null, initialDelayMs: 0, ...opts,
  };
  const count = o.reviewsCount ?? o.total;
  return `<!doctype html><html><body>
${o.emptyPlace ? '' : `<h1>${o.name}</h1><div class="F7nice"><span aria-hidden="true">4.4</span></div>`}
${o.limitedView ? `<button role="tab" aria-label="Overview">Overview</button><div>You're seeing a limited view of Google Maps. Learn more</div>` : `
<button role="tab" aria-label="Reviews for ${o.name}">Reviews</button>
<button aria-label="More reviews (${count})">More reviews</button>
${o.sortable ? `<button aria-label="Sort reviews" id="sortbtn">Sort</button><div id="menu" style="display:none"><div role="menuitemradio" id="newest">Newest</div></div>` : ''}
<div class="m6QErb DxyBCb" id="feed" style="height:500px;overflow-y:scroll"></div>`}
<script>
const O = ${JSON.stringify(o)};
const feed = document.getElementById('feed');
let order = 'default', shown = 0, loading = false;
function card(i) {
  if (O.cards && O.cards[i]) return O.cards[i];
  const id = order === 'newest' ? 'N' + i : 'R' + i;
  return '<div data-review-id="' + id + '" style="height:120px"><div class="d4r55">Person ' + id + '</div>'
    + '<span class="kvMYJc" role="img" aria-label="' + (1 + (i % 5)) + ' stars"></span>'
    + '<span class="rsqaWe">' + (i + 1) + ' days ago</span><div class="MyEned"><span class="wiI7pd">Text ' + id + '</span></div></div>';
}
function render(n) { shown = Math.min(n, O.cards ? O.cards.length : O.total); let h = ''; for (let i = 0; i < shown; i++) h += card(i); feed.innerHTML = h; }
if (feed) {
  setTimeout(() => render(O.batch), O.initialDelayMs);
  feed.addEventListener('scroll', () => {
    if (loading || shown >= O.total) return;
    if (feed.scrollTop + feed.clientHeight < feed.scrollHeight - 50) return;
    loading = true;
    if (O.gapMs) { feed.innerHTML = ''; }
    setTimeout(() => { render(shown + O.batch); loading = false; }, O.gapMs || 200);
  });
}
const sb = document.getElementById('sortbtn');
if (sb) {
  sb.onclick = () => { document.getElementById('menu').style.display = 'block'; };
  document.getElementById('newest').onclick = () => {
    document.getElementById('menu').style.display = 'none';
    feed.innerHTML = '';
    setTimeout(() => { order = 'newest'; render(O.batch); }, O.sortRenderMs);
  };
}
</script></body></html>`;
}

export async function withFakeMaps(opts, fn) {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext();
    await context.route('https://www.google.com/**', (route) =>
      route.fulfill({ status: 200, contentType: 'text/html', body: fakeMapsHtml(opts) }));
    await context.route(/^(?!https:\/\/www\.google\.com\/).*/, (route) => route.abort());
    return await fn(context);
  } finally {
    await browser.close();
  }
}

export const FAST = { scrollIdleMs: 150, afterClickMs: 100, placeTimeoutMs: 60_000, networkTimeoutMs: 10_000 };

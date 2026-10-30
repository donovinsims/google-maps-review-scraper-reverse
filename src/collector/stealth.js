// Realistic Chrome UA pool with matching Sec-CH-UA brands
const UA_POOL = [
  {
    ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    brands: [
      { brand: 'Google Chrome', version: '131' },
      { brand: 'Chromium', version: '131' },
      { brand: 'Not_A Brand', version: '24' },
    ],
  },
  {
    ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    brands: [
      { brand: 'Google Chrome', version: '131' },
      { brand: 'Chromium', version: '131' },
      { brand: 'Not_A Brand', version: '24' },
    ],
  },
  {
    ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    brands: [
      { brand: 'Google Chrome', version: '130' },
      { brand: 'Chromium', version: '130' },
      { brand: 'Not_A Brand', version: '24' },
    ],
  },
  {
    ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    brands: [
      { brand: 'Google Chrome', version: '130' },
      { brand: 'Chromium', version: '130' },
      { brand: 'Not_A Brand', version: '24' },
    ],
  },
  {
    ua: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    brands: [
      { brand: 'Google Chrome', version: '131' },
      { brand: 'Chromium', version: '131' },
      { brand: 'Not_A Brand', version: '24' },
    ],
  },
];

const TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Phoenix',
];

export function pickTimezone() {
  return TIMEZONES[Math.floor(Math.random() * TIMEZONES.length)];
}

export function pickFingerprint() {
  const entry = UA_POOL[Math.floor(Math.random() * UA_POOL.length)];
  return {
    userAgent: entry.ua,
    brands: entry.brands,
    viewport: {
      width: 1366 + Math.floor(Math.random() * 200), // 1366-1566
      height: 768 + Math.floor(Math.random() * 200),  // 768-968
    },
    locale: 'en-US',
    timezoneId: pickTimezone(),
    screen: {
      width: 1920,
      height: 1080,
    },
  };
}

// WebGL vendor/renderer spoof script
export function webglOverrideScript() {
  return `
    (() => {
      const getParam = WebGLRenderingContext.prototype.getParameter;
      WebGLRenderingContext.prototype.getParameter = function(param) {
        if (param === 37445) return 'Intel Inc.';
        if (param === 37446) return 'Intel(R) UHD Graphics 630';
        return getParam.call(this, param);
      };
      if (typeof WebGL2RenderingContext !== 'undefined') {
        const getParam2 = WebGL2RenderingContext.prototype.getParameter;
        WebGL2RenderingContext.prototype.getParameter = function(param) {
          if (param === 37445) return 'Intel Inc.';
          if (param === 37446) return 'Intel(R) UHD Graphics 630';
          return getParam2.call(this, param);
        };
      }
    })();
  `;
}

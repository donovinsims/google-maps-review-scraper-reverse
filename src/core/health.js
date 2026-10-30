// Checks: page responsive? context alive? no crash dialog?
export async function checkPageHealth(page, timeoutMs = 5000) {
  try {
    const result = await Promise.race([
      page.evaluate(() => ({ ok: true, url: location.href })),
      new Promise((_, reject) => setTimeout(() => reject(new Error('health-timeout')), timeoutMs)),
    ]);
    return { healthy: true, ...result };
  } catch (err) {
    return { healthy: false, error: err.message };
  }
}

// Detects Google's block pages and challenge walls.
export function classifyPage(url = '', bodySnippet = '') {
  if (/\/sorry\/|unusual.?traffic/i.test(url)) return 'blocked';
  if (/accounts\.google\.[a-z.]+\/(v3\/|signin|ServiceLogin)/i.test(url)) return 'sign-in-wall';
  if (/recaptcha|captcha/i.test(bodySnippet)) return 'captcha';
  return 'ok';
}

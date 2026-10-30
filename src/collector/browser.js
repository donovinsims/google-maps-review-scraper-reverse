// Browser & profile management for authenticated Google Maps sessions.
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'rebrowser-playwright';

export function getProfileDir(projectRoot, profileName = 'default') {
  const safeName = String(profileName).replace(/[^a-zA-Z0-9_-]/g, '_') || 'default';
  return path.join(projectRoot, 'data', 'profiles', safeName);
}

export function hasSavedProfile(projectRoot, profileName = 'default') {
  const p = getProfileDir(projectRoot, profileName);
  return fs.existsSync(p) && fs.readdirSync(p).length > 0;
}

export function hasSystemChrome() {
  return fs.existsSync('/Applications/Google Chrome.app');
}

export function parseProxy(proxyStr) {
  if (!proxyStr) return undefined;
  try {
    const u = new URL(proxyStr);
    const proxy = { server: `${u.protocol}//${u.host}` };
    if (u.username) proxy.username = decodeURIComponent(u.username);
    if (u.password) proxy.password = decodeURIComponent(u.password);
    return proxy;
  } catch {
    return { server: proxyStr };
  }
}

/**
 * Open a headed browser session with a persistent profile.
 * Allows user to log into Google Maps once; cookies and credentials remain local.
 */
export async function openLogin({ login = true, projectRoot, profileName = 'default', proxy = null, useChrome = true }) {
  const profileDir = getProfileDir(projectRoot, profileName);
  fs.mkdirSync(profileDir, { recursive: true });

  const channel = (useChrome && hasSystemChrome()) ? 'chrome' : undefined;
  console.log(`Opening browser (${channel ?? 'chromium'}) with persistent profile at: ${path.relative(projectRoot, profileDir)}`);
  console.log(login
    ? 'Log into your Google account in Google Maps. When finished, close the browser window.'
    : 'Sign out or clear cookies in Google Maps. When finished, close the browser window.');

  const context = await chromium.launchPersistentContext(profileDir, {
    headless: false,
    channel,
    viewport: { width: 1400, height: 960 },
    locale: 'en-US',
    proxy: parseProxy(proxy),
    args: [
      '--lang=en-US',
      '--disable-blink-features=AutomationControlled',
      '--no-first-run',
    ],
  });

  const page = context.pages()[0] ?? (await context.newPage());
  const targetUrl = login
    ? 'https://accounts.google.com/ServiceLogin?service=maps'
    : 'https://www.google.com/maps';

  await page.goto(targetUrl).catch(() => { });

  // Keep process alive until user closes browser window
  await new Promise((resolve) => {
    context.on('close', resolve);
  });

  console.log('Browser closed. Profile state saved.');
}

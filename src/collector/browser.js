// Browser & profile management for authenticated Google Maps sessions.
import path from 'node:path';
import fs from 'node:fs';
import { chromium } from 'rebrowser-playwright';

import os from 'node:os';

/**
 * F12: signed-in profiles hold Google session cookies, so they live outside the repo:
 * $GMR_PROFILE_DIR, else $XDG_DATA_HOME/gmr/profiles, else ~/.local/share/gmr/profiles.
 */
export function profilesRoot() {
  if (process.env.GMR_PROFILE_DIR) return path.resolve(process.env.GMR_PROFILE_DIR);
  const base = process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share');
  return path.join(base, 'gmr', 'profiles');
}

const safeProfileName = (n) => String(n).replace(/[^a-zA-Z0-9_-]/g, '_') || 'default';
const legacyProfileDir = (projectRoot, name) => path.join(projectRoot, 'data', 'profiles', safeProfileName(name));

/** Refuse a profile location inside the project tree (it could be committed). */
export function assertOutsideRepo(projectRoot, dir) {
  const rel = path.relative(path.resolve(projectRoot), path.resolve(dir));
  if (!rel.startsWith('..') && !path.isAbsolute(rel)) {
    throw new Error(`profile directory ${dir} is inside the project tree; set GMR_PROFILE_DIR outside the repo`);
  }
}

/** Create the profile dir (and root) with owner-only permissions. */
export function ensureProfileDir(dir) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.chmodSync(path.dirname(dir), 0o700);
  fs.chmodSync(dir, 0o700);
  return dir;
}

/**
 * One-time migration: MOVE <repo>/data/profiles/<name> to the user data dir so the
 * session is never duplicated. If both exist, nothing is moved and a warning is returned.
 */
export function migrateLegacyProfile(projectRoot, profileName = 'default') {
  const from = legacyProfileDir(projectRoot, profileName);
  const to = path.join(profilesRoot(), safeProfileName(profileName));
  if (!fs.existsSync(from)) return { migrated: false, reason: 'no-legacy' };
  if (fs.existsSync(to) && fs.readdirSync(to).length > 0) {
    return { migrated: false, reason: 'both-exist', warning: `legacy profile ${from} left in place because ${to} already exists; remove one manually` };
  }
  fs.mkdirSync(path.dirname(to), { recursive: true, mode: 0o700 });
  if (fs.existsSync(to)) fs.rmdirSync(to);
  try { fs.renameSync(from, to); }
  catch (err) {
    if (err.code !== 'EXDEV') throw err;
    fs.cpSync(from, to, { recursive: true });
    fs.rmSync(from, { recursive: true, force: true });
  }
  ensureProfileDir(to);
  return { migrated: true, from, to };
}

export function getProfileDir(projectRoot, profileName = 'default') {
  const dir = path.join(profilesRoot(), safeProfileName(profileName));
  assertOutsideRepo(projectRoot, dir);
  const m = migrateLegacyProfile(projectRoot, profileName);
  if (m.migrated) console.log(`Moved profile "${profileName}" out of the repo to ${m.to}`);
  if (m.warning) console.warn(`Warning: ${m.warning}`);
  return dir;
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
  const profileDir = ensureProfileDir(getProfileDir(projectRoot, profileName));

  const channel = (useChrome && hasSystemChrome()) ? 'chrome' : undefined;
  console.log(`Opening browser (${channel ?? 'chromium'}) with persistent profile at: ${profileDir}`);
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

import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { profilesRoot, getProfileDir, migrateLegacyProfile, ensureProfileDir, assertOutsideRepo } from '../../src/collector/browser.js';

let tmp, repo, prev;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gmr-f12-'));
  repo = path.join(tmp, 'repo'); fs.mkdirSync(repo);
  prev = process.env.GMR_PROFILE_DIR;
  process.env.GMR_PROFILE_DIR = path.join(tmp, 'userdata', 'profiles');
});
afterEach(() => {
  if (prev === undefined) delete process.env.GMR_PROFILE_DIR; else process.env.GMR_PROFILE_DIR = prev;
  fs.rmSync(tmp, { recursive: true, force: true });
});
const mode = (p) => fs.statSync(p).mode & 0o777;

test('F12: profiles live outside the repo (GMR_PROFILE_DIR, else XDG/~/.local/share/gmr/profiles)', () => {
  assert.equal(getProfileDir(repo, 'default'), path.join(tmp, 'userdata', 'profiles', 'default'));
  delete process.env.GMR_PROFILE_DIR;
  const xdg = process.env.XDG_DATA_HOME;
  process.env.XDG_DATA_HOME = path.join(tmp, 'xdg');
  assert.equal(profilesRoot(), path.join(tmp, 'xdg', 'gmr', 'profiles'));
  delete process.env.XDG_DATA_HOME;
  assert.equal(profilesRoot(), path.join(os.homedir(), '.local', 'share', 'gmr', 'profiles'));
  if (xdg !== undefined) process.env.XDG_DATA_HOME = xdg;
});

test('F12: profile dir and its parent are created 0700', () => {
  const d = ensureProfileDir(getProfileDir(repo, 'default'));
  assert.equal(mode(d), 0o700);
  assert.equal(mode(path.dirname(d)), 0o700);
});

test('F12: legacy repo profile is MOVED once (not copied), with 0700', () => {
  const legacy = path.join(repo, 'data', 'profiles', 'default');
  fs.mkdirSync(path.join(legacy, 'Default'), { recursive: true });
  fs.writeFileSync(path.join(legacy, 'Default', 'Cookies'), 'secret');
  const dir = getProfileDir(repo, 'default');
  assert.equal(fs.existsSync(legacy), false, 'legacy copy must be gone');
  assert.equal(fs.readFileSync(path.join(dir, 'Default', 'Cookies'), 'utf8'), 'secret');
  assert.equal(mode(dir), 0o700);
  assert.deepEqual(migrateLegacyProfile(repo, 'default'), { migrated: false, reason: 'no-legacy' });
});

test('F12: if both locations exist nothing is moved or overwritten', () => {
  const legacy = path.join(repo, 'data', 'profiles', 'default');
  fs.mkdirSync(legacy, { recursive: true }); fs.writeFileSync(path.join(legacy, 'a'), 'old');
  const target = path.join(process.env.GMR_PROFILE_DIR, 'default');
  fs.mkdirSync(target, { recursive: true }); fs.writeFileSync(path.join(target, 'a'), 'new');
  const r = migrateLegacyProfile(repo, 'default');
  assert.equal(r.reason, 'both-exist');
  assert.equal(fs.readFileSync(path.join(legacy, 'a'), 'utf8'), 'old');
  assert.equal(fs.readFileSync(path.join(target, 'a'), 'utf8'), 'new');
});

test('F12: a profile location inside the project tree is refused', () => {
  process.env.GMR_PROFILE_DIR = path.join(repo, 'profiles');
  assert.throws(() => getProfileDir(repo, 'default'), /inside the project tree/);
  assert.doesNotThrow(() => assertOutsideRepo(repo, path.join(tmp, 'elsewhere')));
});

test('F12: .gitignore keeps profiles and cookie stores out of git', () => {
  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
  for (const f of ['data/profiles/default/Default/Cookies', 'x/profiles/y', 'Default/Login Data', 'a/Cookies', 'data/x.db']) {
    assert.doesNotThrow(() => execSync(`git check-ignore -q --no-index "${f}"`, { cwd: root }), f);
  }
});

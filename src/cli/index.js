#!/usr/bin/env node
// CLI entrypoint: local-only usage of collector + store + exports.
import { Command } from 'commander';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

export function resolveUrlList(projectRoot, argsArr) {
  const urls = [];
  for (const a of argsArr) {
    const abs = path.resolve(projectRoot, a);
    if (fs.existsSync(abs)) {
      const text = fs.readFileSync(abs, 'utf8');
      for (const line of text.split('\n')) {
        const t = line.trim();
        if (t && t.startsWith('http')) urls.push(t);
      }
    } else if (a.startsWith('http')) {
      urls.push(a);
    } else {
      throw new Error(`Not a URL and not a file: ${a}`);
    }
  }
  return urls;
}

const program = new Command();
program.name('gmr').description('Google Maps reviews scraper (local, no vendor quota)').version('0.1.0');

program
  .command('login')
  .description('Open a browser to sign into Google Maps once; saves a local profile reused by collection (needed for full pagination)')
  .option('--profile <name>', 'profile name to use or create', 'default')
  .option('--logout', 'Open the profile for sign-out instead')
  .action(async (opts) => {
    const { openLogin } = await import('../collector/browser.js');
    await openLogin({ login: !opts.logout, projectRoot: PROJECT_ROOT, profileName: opts.profile });
  });

program
  .command('run')
  .description('Collect reviews for one Google Maps place URL, or a file/inline list of URLs (one per line)')
  .argument('<urls...>', 'a single place URL, several URLs, or a txt/csv path containing URLs')
  .option('--limit <n>', 'max reviews per business', Number)
  .option('--concurrency <n>', 'places processed in parallel', Number, 1)
  .option('--sort <mode>', 'newest|relevant|oldest|highest|lowest', 'newest')
  .option('--language <code>', 'language hint for consent + Google UI', 'en')
  .option('--profile <name>', 'persistent browser profile name')
  .option('--no-profile', 'force anonymous execution without saved profile')
  .option('--incremental', 'skip businesses already collected recently')
  .option('--db <path>', 'database path override')
  .action(async (urlsArg, opts) => {
    const listingUrls = await resolveUrlList(PROJECT_ROOT, urlsArg);
    const baseConfig = {
      listingUrls,
      limit: opts.limit,
      sort: opts.sort ?? 'newest',
      language: opts.language ?? 'en',
      concurrency: opts.concurrency,
      profile: opts.profile === false ? false : (opts.profile ?? undefined),
      incremental: opts.incremental ?? false,
      db: opts.db,
    };
    const { collectForPlaces } = await import('./runner.js');
    await collectForPlaces(baseConfig);
  });

program
  .command('status')
  .description('Show businesses and review counts collected so far')
  .option('--db <path>', 'database path override')
  .action(async (opts) => {
    const { createStore } = await import('../core/store.js');
    const store = createStore(opts.db ?? path.join(PROJECT_ROOT, 'data', 'gmaps-reviews.db'));
    for (const p of store.selectPlaces()) {
      console.log(`${p.placeId}\t${p.name ?? '?'}\treviews=${store.countReviews(p.placeId)}`);
    }
    console.log(`Total: ${store.selectPlaces().length} businesses, ${store.countReviews()} reviews`);
  });

program
  .command('export')
  .description('Export collected reviews from the local DB')
  .requiredOption('--format <fmt>', 'csv|json')
  .option('--placeId <id>', 'filter by business')
  .option('--out <path>', 'output file')
  .option('--db <path>', 'database path override')
  .action(async (opts) => {
    const { createStore } = await import('../core/store.js');
    const store = createStore(opts.db ?? path.join(PROJECT_ROOT, 'data', 'gmaps-reviews.db'));
    const rows = store.selectReviews({ placeId: opts.placeId });
    const { toCsv, toJsonExport } = await import('../export/exporters.js');
    const body = opts.format === 'json' ? toJsonExport(rows, { placeId: opts.placeId ?? null }) : toCsv(rows);
    if (opts.out) {
      fs.mkdirSync(path.dirname(path.resolve(opts.out)), { recursive: true });
      fs.writeFileSync(opts.out, body);
      console.log(`Wrote ${opts.out}`);
    } else {
      process.stdout.write(body);
    }
    console.error(`exported ${rows.length} reviews as ${opts.format}`);
  });

program
  .command('delete')
  .description('Delete a place and its reviews (retention control)')
  .requiredOption('--placeId <id>')
  .option('--db <path>', 'database path override')
  .action(async (opts) => {
    const { createStore } = await import('../core/store.js');
    const store = createStore(opts.db ?? path.join(PROJECT_ROOT, 'data', 'gmaps-reviews.db'));
    store.deleteReviews(opts.placeId);
    console.log(`Deleted ${opts.placeId}`);
  });

program
  .command('serve')
  .description('Start the local-only dashboard')
  .option('--port <n>', 'port', Number, 7877)
  .option('--db <path>', 'database path override')
  .action(async (opts) => {
    const { createDashboardServer } = await import('../dashboard/server.js');
    createDashboardServer({ dbPath: opts.db ?? path.join(PROJECT_ROOT, 'data', 'gmaps-reviews.db'), port: opts.port });
  });

program.parseAsync(process.argv).catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});

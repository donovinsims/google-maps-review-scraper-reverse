// Runner: iterates place URLs, tracks job state in SQLite, launches batch collector.
import path from 'node:path';
import fs from 'node:fs';
import { PROJECT_ROOT } from './index.js';
import { createStore } from '../core/store.js';
import { normalizeReview } from '../core/normalize.js';

export async function collectForPlaces(config) {
  const { listingUrls } = config;
  const db = createStore(config.db ?? path.join(PROJECT_ROOT, 'data', 'gmaps-reviews.db'));
  const jobId = config.jobId ?? `job-${Date.now()}`;

  db.createJob({
    id: jobId,
    config,
    totalPlaces: listingUrls.length,
    notes: `Collecting ${listingUrls.length} place(s)`,
  });

  // Graceful shutdown on SIGINT/SIGTERM — save progress, update job status
  let shuttingDown = false;
  const onSignal = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\nGraceful shutdown (${signal}): saving progress...`);
    try {
      db.updateJobStatus(jobId, 'interrupted', `Process interrupted by ${signal}`);
    } catch {}
    process.exit(130);
  };
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);

  try {
    const { launchBatchCollector } = await import('../collector/batch.js');

  const summary = await launchBatchCollector(listingUrls, config, async (result, listingUrl, idx = 0) => {
    const placeId = result.place?.placeId ?? null;
    const placeName = result.place?.name ?? null;

    if (placeId) {
      db.upsertBusinessMeta({
        placeId,
        name: placeName,
        listingUrl,
        reviewsCount: result.place?.reviewsCount ?? null,
        rating: result.place?.rating ?? null,
        lastSeenAt: new Date().toISOString(),
      });
    }

    if (placeId && result.reviews?.length) {
      const normalized = result.reviews.map((r) =>
        normalizeReview(r, { placeId, listingUrl, runId: jobId }).record
      );
      for (const rec of normalized) {
        db.upsertReview(rec, jobId);
      }
    }

    const itemStatus = result.termination?.reason === 'failed' ? 'failed'
      : result.reviews?.length ? 'done' : (result.termination?.reason ?? 'done');

    db.recordJobItem({
      jobId,
      idx,
      inputUrl: listingUrl,
      placeId,
      status: itemStatus,
      attempt: 1,
      error: result.termination?.detail ?? null,
      termination: result.termination ?? null,
    });

    return {
      listingUrl,
      placeId,
      placeName,
      collected: result.reviews?.length ?? 0,
      duplicates: result.termination?.duplicates ?? 0,
      termination: result.termination,
      durationMs: result.durationMs ?? null,
    };
  });

    const allCompleted = summary.every((s) => !s.error && s.termination?.reason !== 'failed');
    db.updateJobStatus(jobId, allCompleted ? 'completed' : 'failed');

    const outDir = path.join(PROJECT_ROOT, 'data', 'out');
    fs.mkdirSync(outDir, { recursive: true });
    const outFile = path.join(outDir, `run-${Date.now()}.json`);
    fs.writeFileSync(outFile, JSON.stringify(summary, null, 2));

    console.log(`\nJob ${jobId} finished. Total reviews in store: ${db.countReviews()}`);
    console.log(`Summary written to: ${path.relative(PROJECT_ROOT, outFile)}`);
    return summary;
  } finally {
    process.off('SIGINT', onSignal);
    process.off('SIGTERM', onSignal);
  }
}

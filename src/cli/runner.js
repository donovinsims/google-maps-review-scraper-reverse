// Runner: iterates place URLs, tracks job state in SQLite, launches batch collector.
import path from 'node:path';
import fs from 'node:fs';
import { PROJECT_ROOT } from './index.js';
import { createStore } from '../core/store.js';
import { normalizeReview } from '../core/normalize.js';
import { classifyItem } from '../core/status.js';

export async function collectForPlaces(config) {
  const db = createStore(config.db ?? path.join(PROJECT_ROOT, 'data', 'gmaps-reviews.db'));
  let listingUrls = config.listingUrls ?? [];
  let jobId = config.jobId ?? `job-${Date.now()}`;

  // Genuine resume support: load existing job checkpoints
  if (config.resume) {
    const existingJob = db.getJob(config.resume);
    if (!existingJob) {
      throw new Error(`Cannot resume: job "${config.resume}" not found in database.`);
    }
    jobId = config.resume;
    const completedUrls = new Set(
      (existingJob.items ?? [])
        .filter((item) => item.status === 'done' || item.status === 'completed' || item.status === 'skipped')
        .map((item) => item.inputUrl)
    );
    const originalUrls = existingJob.config?.listingUrls ?? listingUrls;
    listingUrls = originalUrls.filter((u) => !completedUrls.has(u));
    console.log(`Resuming job ${jobId}: ${completedUrls.size} completed, ${listingUrls.length} pending.`);
    db.updateJobStatus(jobId, 'running', `Resuming job: ${listingUrls.length} remaining places`);
  } else {
    db.createJob({
      id: jobId,
      config,
      totalPlaces: listingUrls.length,
      notes: `Collecting ${listingUrls.length} place(s)`,
    });
  }

  if (listingUrls.length === 0) {
    console.log(`No pending URLs to process for job ${jobId}.`);
    db.updateJobStatus(jobId, 'completed', 'All URLs previously completed or skipped');
    return [];
  }

  // Pass incremental check helper down to collector
  const batchConfig = {
    ...config,
    isPlaceCollected: (placeId) => db.isPlaceCollected(placeId, 7),
  };

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

    // Streaming batch callback: persist to SQLite immediately as cards load
    const onBatch = async (data, listingUrl) => {
      const placeId = data.place?.placeId;
      if (placeId) {
        db.upsertBusinessMeta({
          placeId,
          name: data.place?.name ?? null,
          listingUrl,
          reviewsCount: data.place?.reviewsCount ?? null,
          rating: data.place?.rating ?? null,
          lastSeenAt: new Date().toISOString(),
        });
      }
      if (placeId && data.reviews?.length) {
        const normalized = data.reviews.map((r) =>
          normalizeReview(r, { placeId, listingUrl, runId: jobId }).record
        );
        db.upsertReviews(normalized, jobId);
      }
    };

    const summary = await launchBatchCollector(
      listingUrls,
      batchConfig,
      async (result, listingUrl, idx = 0) => {
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
          db.upsertReviews(normalized, jobId);
        }

        const itemStatus = classifyItem(result);
        if (result.termination) {
          result.termination.expectedCount = result.place?.reviewsCount ?? null;
          result.termination.collectedCount = result.reviews?.length ?? 0;
        }

        db.recordJobItem({
          jobId,
          idx,
          inputUrl: listingUrl,
          placeId,
          status: itemStatus,
          attempt: 1,
          error: result.termination?.detail ?? result.error ?? null,
          termination: result.termination ?? null,
        });

        return {
          listingUrl,
          placeId,
          placeName,
          status: itemStatus,
          collected: result.reviews?.length ?? 0,
          duplicates: result.termination?.duplicates ?? 0,
          termination: result.termination,
          durationMs: result.durationMs ?? null,
        };
      },
      onBatch
    );

    // Determine honest aggregate job status
    const hasFailed = summary.some((s) => s.status === 'failed');
    const hasBlocked = summary.some((s) => s.status === 'blocked');
    const hasPartial = summary.some((s) => s.status === 'partial');
    const allSkipped = summary.length > 0 && summary.every((s) => s.status === 'skipped');

    let finalJobStatus = 'completed';
    if (hasFailed) {
      finalJobStatus = 'failed';
      process.exitCode = 1;
    } else if (hasBlocked) {
      finalJobStatus = 'blocked';
      process.exitCode = 3;
    } else if (hasPartial) {
      finalJobStatus = 'partial';
      process.exitCode = 2;
    } else if (allSkipped) {
      finalJobStatus = 'completed';
      process.exitCode = 0;
    } else {
      finalJobStatus = 'completed';
      process.exitCode = 0;
    }

    const counts = {
      done: summary.filter((s) => s.status === 'done').length,
      partial: summary.filter((s) => s.status === 'partial').length,
      blocked: summary.filter((s) => s.status === 'blocked').length,
      failed: summary.filter((s) => s.status === 'failed').length,
      skipped: summary.filter((s) => s.status === 'skipped').length,
    };

    db.updateJobStatus(
      jobId,
      finalJobStatus,
      `Finished: ${counts.done} done, ${counts.partial} partial, ${counts.blocked} blocked, ${counts.failed} failed, ${counts.skipped} skipped`
    );

    const outDir = path.join(PROJECT_ROOT, 'data', 'out');
    fs.mkdirSync(outDir, { recursive: true });
    const outFile = path.join(outDir, `run-${Date.now()}.json`);
    fs.writeFileSync(outFile, JSON.stringify(summary, null, 2));

    console.log(`\nJob ${jobId} finished [status=${finalJobStatus}]. Total reviews in store: ${db.countReviews()}`);
    console.log(`Summary written to: ${path.relative(PROJECT_ROOT, outFile)}`);
    return summary;
  } finally {
    process.off('SIGINT', onSignal);
    process.off('SIGTERM', onSignal);
  }
}

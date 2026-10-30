// Runner: iterates place URLs, launches one browser, stores results.
import path from 'node:path';
import fs from 'node:fs';
import { PROJECT_ROOT } from './index.js';
import { createStore } from '../core/store.js';
import { normalizeReview } from '../core/normalize.js';

export async function collectForPlaces(config) {
  const { listingUrls } = config;
  const db = createStore(config.db ?? path.join(PROJECT_ROOT, 'data', 'gmaps-reviews.db'));
  const { launchBatchCollector } = await import('../collector/batch.js');
  const summary = await launchBatchCollector(listingUrls, config, async (result, listingUrl) => {
    const normalized = result.reviews.map((r) => normalizeReview(r, { placeId: result.place?.placeId, listingUrl }).record);
    for (const rec of normalized) db.upsertReview(rec, result.runId ?? null);
    if (result.place?.placeId) {
      db.upsertBusinessMeta({
        placeId: result.place.placeId, name: result.place.name,
        listingUrl, reviewsCount: result.place.reviewsCount ?? null,
        rating: result.place.rating ?? null, lastSeenAt: null,
      });
    }
    return {
      listingUrl,
      placeId: result.place?.placeId ?? null,
      placeName: result.place?.name ?? null,
      collected: result.reviews.length,
      duplicates: result.termination?.duplicates ?? 0,
      termination: result.termination,
      durationMs: result.durationMs ?? null,
    };
  });

  const outDir = path.join(PROJECT_ROOT, 'data', 'out');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `run-${Date.now()}.json`);
  fs.writeFileSync(outFile, JSON.stringify(summary, null, 2));
  console.log(`Done. Summary at ${path.relative(PROJECT_ROOT, outFile)}. Reviews: ${db.countReviews()}`);
  return summary;
}

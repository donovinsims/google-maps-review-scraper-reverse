// Store layer: all reads/writes to the local DB (businesses, reviews, jobs).
import path from 'node:path';
import { openDb } from './db.js';

export function createStore(dbPath) {
  const db = openDb(dbPath ?? path.resolve(process.cwd(), 'data', 'gmaps-reviews.db'));

  function upsertBusinessMeta(meta) {
    if (!meta?.placeId) return;
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO businesses (placeId, name, listingUrl, inputUrl, reviewsCount, rating, firstSeenAt, lastSeenAt)
      VALUES (?,?,?,?,?,?,?,?)
      ON CONFLICT(placeId) DO UPDATE SET
        name = COALESCE(excluded.name, name),
        listingUrl = COALESCE(excluded.listingUrl, listingUrl),
        reviewsCount = COALESCE(excluded.reviewsCount, reviewsCount),
        rating = COALESCE(excluded.rating, rating),
        lastSeenAt = ?`).run(
          meta.placeId, meta.name ?? null, meta.listingUrl ?? null, meta.inputUrl ?? null,
          meta.reviewsCount ?? null, meta.rating ?? null, now, meta.lastSeenAt ?? now, now);
  }

  function upsertReview(rec, runId) {
    if (!rec?.placeId || !rec?.reviewId) return false;
    const now = new Date().toISOString();
    const json = (v) => (v == null ? null : typeof v === 'object' ? JSON.stringify(v) : v);
    db.prepare(`
      INSERT INTO reviews (
        reviewId, placeId, reviewerName, reviewerProfileUrl, rating, ratingRaw,
        reviewText, originalLanguage, translatedByGoogle,
        publishedDateRaw, publishedDateParsed, datePrecision,
        ownerResponse, ownerResponseDateRaw, ownerResponseDateParsed, ownerResponseDatePrecision,
        reviewUrl, firstCollectedAt, lastCollectedAt, collectedCount, runId)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(placeId, reviewId) DO UPDATE SET
        reviewerName = COALESCE(excluded.reviewerName, reviewerName),
        reviewerProfileUrl = COALESCE(excluded.reviewerProfileUrl, reviewerProfileUrl),
        rating = COALESCE(excluded.rating, rating),
        ratingRaw = COALESCE(excluded.ratingRaw, ratingRaw),
        reviewText = CASE WHEN excluded.reviewText IS NOT NULL AND (reviewText IS NULL OR length(excluded.reviewText) > length(COALESCE(reviewText, ''))) THEN excluded.reviewText ELSE COALESCE(reviewText, excluded.reviewText) END,
        originalLanguage = COALESCE(excluded.originalLanguage, originalLanguage),
        translatedByGoogle = COALESCE(excluded.translatedByGoogle, translatedByGoogle),
        publishedDateRaw = COALESCE(excluded.publishedDateRaw, publishedDateRaw),
        publishedDateParsed = COALESCE(excluded.publishedDateParsed, publishedDateParsed),
        datePrecision = COALESCE(excluded.datePrecision, datePrecision),ownerResponse = COALESCE(excluded.ownerResponse, ownerResponse),
        ownerResponseDateRaw = COALESCE(excluded.ownerResponseDateRaw, ownerResponseDateRaw),
        ownerResponseDateParsed = COALESCE(excluded.ownerResponseDateParsed, ownerResponseDateParsed),
        ownerResponseDatePrecision = COALESCE(excluded.ownerResponseDatePrecision, ownerResponseDatePrecision),
        reviewUrl = COALESCE(excluded.reviewUrl, reviewUrl),
        lastCollectedAt = excluded.lastCollectedAt,
        collectedCount = collectedCount + 1,
        runId = excluded.runId`).run(
          rec.reviewId, rec.placeId, rec.reviewerName ?? null, rec.reviewerProfileUrl ?? null,
          rec.rating ?? null, rec.ratingRaw ?? null, rec.reviewText ?? null,
          rec.originalLanguage ?? null, rec.translatedByGoogle ?? null,
          json(rec.publishedDateRaw) ?? null, json(rec.publishedDateParsed) ?? null, json(rec.datePrecision) ?? null,
          rec.ownerResponse ?? null, rec.ownerResponseDateRaw ?? null,
          json(rec.ownerResponseDateParsed) ?? null, json(rec.ownerResponseDatePrecision) ?? null,
          rec.reviewUrl ?? null, now, now, rec.collectedCount ?? 1, runId ?? null);
    return true;
  }

  function upsertReviews(records, runId) {
    if (!records || !records.length) return 0;
    let count = 0;
    db.exec('BEGIN');
    try {
      for (const rec of records) {
        if (upsertReview(rec, runId)) count++;
      }
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
    return count;
  }

  function countReviews(placeId) {
    if (placeId) return db.prepare('SELECT COUNT(*) AS n FROM reviews WHERE placeId = ?').get(placeId).n;
    return db.prepare('SELECT COUNT(*) AS n FROM reviews').get().n;
  }

  function selectReviews({ placeId } = {}) {
    if (placeId) return db.prepare('SELECT * FROM reviews WHERE placeId = ? ORDER BY firstCollectedAt DESC').all(placeId);
    return db.prepare('SELECT * FROM reviews ORDER BY firstCollectedAt DESC').all();
  }

  function selectPlaces() {
    return db.prepare('SELECT * FROM businesses ORDER BY firstSeenAt DESC').all();
  }

  function deleteReviews(placeId) {
    db.prepare('DELETE FROM reviews WHERE placeId = ?').run(placeId);
    db.prepare('DELETE FROM businesses WHERE placeId = ?').run(placeId);
  }

  function retentionVacuum(olderThanDays) {
    const cutoff = new Date(Date.now() - olderThanDays * 86400000).toISOString();
    db.prepare('DELETE FROM reviews WHERE lastCollectedAt < ?').run(cutoff);
    return db.prepare('SELECT COUNT(*) AS n FROM reviews').get().n;
  }

  function createJob({ id, config = {}, totalPlaces = 0, notes = null }) {
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO jobs (id, createdAt, updatedAt, status, config, totalPlaces, notes)
      VALUES (?, ?, ?, 'running', ?, ?, ?)
    `).run(id, now, now, JSON.stringify(config), totalPlaces, notes);
  }

  function updateJobStatus(jobId, status, notes = null) {
    const now = new Date().toISOString();
    db.prepare(`
      UPDATE jobs SET status = ?, updatedAt = ?, notes = COALESCE(?, notes)
      WHERE id = ?
    `).run(status, now, notes, jobId);
  }

  function recordJobItem({ jobId, idx, inputUrl, placeId = null, status = 'pending', attempt = 1, error = null, termination = null }) {
    const now = new Date().toISOString();
    const termJson = termination ? JSON.stringify(termination) : null;
    db.prepare(`
      INSERT INTO job_items (jobId, idx, inputUrl, placeId, status, attempt, error, termination, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(jobId, idx) DO UPDATE SET
        placeId = COALESCE(excluded.placeId, placeId),
        status = excluded.status,
        attempt = excluded.attempt,
        error = excluded.error,
        termination = excluded.termination,
        updatedAt = excluded.updatedAt
    `).run(jobId, idx, inputUrl, placeId, status, attempt, error, termJson, now);
  }

  function getJob(jobId) {
    const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(jobId);
    if (!job) return null;
    const items = db.prepare('SELECT * FROM job_items WHERE jobId = ? ORDER BY idx ASC').all(jobId);
    return { ...job, config: job.config ? JSON.parse(job.config) : null, items };
  }

  function selectRecentJobs(limit = 20) {
    const jobs = db.prepare('SELECT * FROM jobs ORDER BY createdAt DESC LIMIT ?').all(limit);
    return jobs.map((j) => ({ ...j, config: j.config ? JSON.parse(j.config) : null }));
  }

  function isPlaceCollected(placeId, maxAgeDays = 30) {
    if (!placeId) return false;
    const row = db.prepare('SELECT lastSeenAt FROM businesses WHERE placeId = ?').get(placeId);
    if (!row || !row.lastSeenAt) return false;
    if (maxAgeDays == null) return true;
    const ageMs = Date.now() - new Date(row.lastSeenAt).getTime();
    return ageMs < maxAgeDays * 86_400_000;
  }

  return {
    database: db,
    upsertBusinessMeta, upsertReview, upsertReviews, countReviews, selectReviews, selectPlaces,
    deleteReviews, retentionVacuum,
    createJob, updateJobStatus, recordJobItem, getJob, selectRecentJobs, isPlaceCollected,
  };
}

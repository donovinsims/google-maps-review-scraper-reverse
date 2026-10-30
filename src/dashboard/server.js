// Local-only dashboard: job list, review browse, export downloads.
import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { PROJECT_ROOT } from '../cli/index.js';

const DEFAULT_DB = path.join(PROJECT_ROOT, 'data', 'gmaps-reviews.db');

export function createDashboardServer({ dbPath = DEFAULT_DB, port = 7877 } = {}) {
  const app = express();
  app.use(express.json());
  const storeRef = { current: null };
  const getStore = async () => {
    if (!storeRef.current) {
      const { createStore } = await import('../core/store.js');
      storeRef.current = createStore(dbPath);
    }
    return storeRef.current;
  };
  app.use('/static', express.static(path.join(PROJECT_ROOT, 'src', 'dashboard', 'static')));

  app.get('/', (_req, res) => res.sendFile(path.join(PROJECT_ROOT, 'src', 'dashboard', 'static', 'index.html')));

  app.get('/api/places', async (_req, res) => {
    const store = await getStore();
    const places = store.selectPlaces().map((p) => ({ ...p, reviewCount: store.countReviews(p.placeId) }));
    res.json({ schemaVersion: 1, places });
  });

  app.get('/api/places/:placeId/reviews', async (req, res) => {
    const store = await getStore();
    res.json({ schemaVersion: 1, placeId: req.params.placeId, reviews: store.selectReviews({ placeId: req.params.placeId }) });
  });

  app.get('/api/jobs', async (_req, res) => {
    // Job history lives in the summary files under data/out/.
    const dir = path.join(PROJECT_ROOT, 'data', 'out');
    let files = [];
    if (fs.existsSync(dir)) files = fs.readdirSync(dir).filter((f) => f.startsWith('run-') && f.endsWith('.json'));
    files.sort().reverse();
    const jobs = files.map((f) => ({ name: f, data: JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) }));
    res.json({ schemaVersion: 1, jobs });
  });

  app.get('/api/export/csv', async (req, res) => {
    const store = await getStore();
    const rows = store.selectReviews(req.query.placeId ? { placeId: req.query.placeId } : {});
    const { toCsv } = await import('../export/exporters.js');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="reviews-${encodeURIComponent(req.query.placeId ? String(req.query.placeId) : 'all')}.csv"`);
    res.send(toCsv(rows));
  });

  app.get('/api/export/json', async (req, res) => {
    const store = await getStore();
    const rows = store.selectReviews(req.query.placeId ? { placeId: req.query.placeId } : {});
    const { toJsonExport } = await import('../export/exporters.js');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="reviews-${encodeURIComponent(req.query.placeId ? String(req.query.placeId) : 'all')}.json"`);
    res.send(toJsonExport(rows, { placeId: req.query.placeId ?? null }));
  });

  app.get('*', (_req, res) => res.sendFile(path.join(PROJECT_ROOT, 'src', 'dashboard', 'static', 'index.html')));

  const server = app.listen(port, '127.0.0.1', () => console.log(`Dashboard: http://127.0.0.1:${port}`));
  return server;
}

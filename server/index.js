/* eslint-disable no-console */
const path = require('path');
const express = require('express');
const cors = require('cors');
const { MongoClient, GridFSBucket } = require('mongodb');
require('dotenv').config();

const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DB_NAME = process.env.MONGODB_DBNAME || 'timeapp';

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

let client;
let bucket;

async function connectMongo() {
  client = new MongoClient(MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  await client.connect();
  const db = client.db(DB_NAME);
  bucket = new GridFSBucket(db, { bucketName: 'snapshots' });
  console.log(`[mongodb] connected -> ${MONGODB_URI}/${DB_NAME}`);
}

app.get('/api/health', async (_req, res) => {
  try {
    const db = client?.db(DB_NAME);
    if (!db) return res.status(503).json({ ok: false, error: 'MongoDB not connected' });
    await db.command({ ping: 1 });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: String((err && err.message) || err) });
  }
});

app.post('/api/snapshots', async (req, res) => {
  try {
    if (!bucket) return res.status(503).json({ ok: false, error: 'MongoDB not connected' });

    const { entries, filename, meta } = req.body || {};
    if (!Array.isArray(entries)) {
      return res.status(400).json({ ok: false, error: 'entries must be an array' });
    }

    const iso = new Date().toISOString().replace(/[:.]/g, '-');
    const safeName = filename && typeof filename === 'string' && filename.trim() ? filename.trim() : `time-entries-${iso}.json`;
    const json = JSON.stringify(entries, null, 2) + '\n';

    const uploadStream = bucket.openUploadStream(safeName, {
      contentType: 'application/json',
      metadata: {
        count: entries.length,
        createdAt: new Date(),
        ...(meta && typeof meta === 'object' ? meta : {}),
      },
    });

    uploadStream.once('error', (err) => {
      res.status(500).json({ ok: false, error: String((err && err.message) || err) });
    });

    uploadStream.once('finish', () => {
      res.json({ ok: true, id: uploadStream.id, filename: safeName });
    });

    uploadStream.end(Buffer.from(json));
  } catch (err) {
    res.status(500).json({ ok: false, error: String((err && err.message) || err) });
  }
});

// Serve the static app for convenience
const staticDir = path.join(__dirname, '..', 'time-app');
app.use(express.static(staticDir));

app.use((_req, res, next) => {
  if (_req.method !== 'GET') return next();
  res.sendFile(path.join(staticDir, 'index.html'));
});

connectMongo()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`[server] listening on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('[startup] failed to connect to MongoDB', err);
    process.exit(1);
  });

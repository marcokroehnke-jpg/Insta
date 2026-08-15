import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promises as fs } from 'node:fs';

import { createRouter, readBody, sendError, sendJson, serveStatic } from './http.js';
import { UPLOAD_DIR, deleteImage, logEvent, newId, read, saveImage, update } from './store.js';
import { PILLARS, TONES, generateCaptions, reviewCaption } from './caption.js';
import { checkConnection, fetchAccountInsights, fetchMediaInsights } from './instagram.js';
import { fullCaption, nextSlots, publishNow, startScheduler } from './scheduler.js';
import {
  METRIC_LABELS,
  buyerScore,
  buyerSignals,
  recommendations,
  signalsPerMille,
  summarise
} from './funnel.js';

await loadEnvFile();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const PORT = Number(process.env.PORT || 4000);
const HOST = process.env.HOST || '0.0.0.0';

const router = createRouter();

/* ------------------------------------------------------------------ Stammdaten */

router.get('/api/meta', async (_req, res) => {
  sendJson(res, 200, {
    pillars: Object.entries(PILLARS).map(([key, v]) => ({ key, ...v })),
    tones: Object.entries(TONES).map(([key, description]) => ({ key, description })),
    metricLabels: METRIC_LABELS,
    aiConfigured: Boolean(process.env.ANTHROPIC_API_KEY),
    model: process.env.ANTHROPIC_MODEL || 'claude-opus-5'
  });
});

router.get('/api/state', async (_req, res) => {
  const db = await read();
  const summary = summarise(db.posts);
  sendJson(res, 200, {
    settings: redactSettings(db.settings),
    posts: db.posts.map(decoratePost),
    media: db.media,
    events: db.events.slice(0, 40),
    nextSlots: nextSlots(db.settings, db.posts, 10),
    summary
  });
});

router.put('/api/settings', async (req, res) => {
  const body = await readBody(req);
  const saved = await update((db) => {
    const next = { ...db.settings, ...body };
    // Leeres Token-Feld bedeutet "unverändert lassen", nicht "löschen".
    if (!body.igAccessToken) next.igAccessToken = db.settings.igAccessToken;
    next.goals = { ...db.settings.goals, ...(body.goals || {}) };
    next.slots = Array.isArray(body.slots) ? body.slots : db.settings.slots;
    db.settings = next;
    return next;
  });
  sendJson(res, 200, redactSettings(saved));
});

/* ---------------------------------------------------------------------- Medien */

router.post('/api/media', async (req, res) => {
  const { dataUrl, label = '', width = 0, height = 0 } = await readBody(req);
  const match = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/s.exec(dataUrl || '');
  if (!match) return sendError(res, 400, 'Es wurde kein gültiges Bild übergeben (JPEG, PNG oder WebP).');

  const [, mime, base64] = match;
  const file = await saveImage(base64, mime);
  const record = {
    id: file.id,
    filename: file.filename,
    mime,
    bytes: file.bytes,
    width: Number(width) || 0,
    height: Number(height) || 0,
    label,
    createdAt: new Date().toISOString()
  };
  await update((db) => db.media.unshift(record));
  sendJson(res, 201, record);
});

router.delete('/api/media/:id', async (_req, res, params) => {
  const removed = await update((db) => {
    const idx = db.media.findIndex((m) => m.id === params.id);
    if (idx === -1) return null;
    const [item] = db.media.splice(idx, 1);
    for (const post of db.posts) post.mediaIds = post.mediaIds.filter((id) => id !== params.id);
    return item;
  });
  if (!removed) return sendError(res, 404, 'Bild nicht gefunden');
  await deleteImage(removed.filename);
  sendJson(res, 200, { ok: true });
});

/* ----------------------------------------------------------------------- Posts */

const EDITABLE_POST_FIELDS = [
  'title',
  'caption',
  'hashtags',
  'firstComment',
  'altText',
  'pillar',
  'cta',
  'product',
  'priceOld',
  'priceNew',
  'deadline',
  'notes',
  'mediaIds',
  'scheduledAt',
  'status'
];

router.post('/api/posts', async (req, res) => {
  const body = await readBody(req);
  const post = {
    id: newId('post'),
    title: body.title || 'Neuer Beitrag',
    caption: body.caption || '',
    hashtags: body.hashtags || [],
    firstComment: body.firstComment || '',
    altText: body.altText || '',
    pillar: body.pillar || 'angebot',
    cta: body.cta || '',
    product: body.product || '',
    priceOld: body.priceOld || '',
    priceNew: body.priceNew || '',
    deadline: body.deadline || '',
    notes: body.notes || '',
    mediaIds: body.mediaIds || [],
    status: body.scheduledAt ? 'scheduled' : 'draft',
    scheduledAt: body.scheduledAt || '',
    publishedAt: '',
    igMediaId: '',
    igPermalink: '',
    attempts: 0,
    error: '',
    insights: {},
    insightsUpdatedAt: '',
    createdAt: new Date().toISOString()
  };
  await update((db) => db.posts.unshift(post));
  sendJson(res, 201, decoratePost(post));
});

router.patch('/api/posts/:id', async (req, res, params) => {
  const body = await readBody(req);
  const updated = await update((db) => {
    const post = db.posts.find((p) => p.id === params.id);
    if (!post) return null;

    for (const key of EDITABLE_POST_FIELDS) {
      if (key in body) post[key] = body[key];
    }

    // Bearbeiten heißt: erneut versuchen. Ohne das Zurücksetzen von attempts
    // überspringt der Auto-Posting-Dienst einen Beitrag mit aufgebrauchten
    // Versuchen dauerhaft, auch wenn der Grund längst behoben ist.
    // Veröffentlichte Beiträge bleiben unangetastet.
    if (['draft', 'scheduled', 'failed'].includes(post.status)) {
      post.status = post.scheduledAt ? 'scheduled' : 'draft';
      post.attempts = 0;
      post.error = '';
    }
    return post;
  });
  if (!updated) return sendError(res, 404, 'Post nicht gefunden');
  sendJson(res, 200, decoratePost(updated));
});

router.delete('/api/posts/:id', async (_req, res, params) => {
  const ok = await update((db) => {
    const idx = db.posts.findIndex((p) => p.id === params.id);
    if (idx === -1) return false;
    db.posts.splice(idx, 1);
    return true;
  });
  if (!ok) return sendError(res, 404, 'Post nicht gefunden');
  sendJson(res, 200, { ok: true });
});

router.post('/api/posts/:id/publish', async (_req, res, params) => {
  const result = await publishNow(params.id);
  const db = await read();
  sendJson(res, 200, { ok: true, result, post: decoratePost(db.posts.find((p) => p.id === params.id)) });
});

router.post('/api/posts/:id/insights', async (_req, res, params) => {
  const db = await read();
  const post = db.posts.find((p) => p.id === params.id);
  if (!post) return sendError(res, 404, 'Post nicht gefunden');
  if (!post.igMediaId) return sendError(res, 400, 'Dieser Post ist noch nicht veröffentlicht.');

  const insights = await fetchMediaInsights(db.settings, post.igMediaId);
  const saved = await update((d) => {
    const p = d.posts.find((x) => x.id === params.id);
    p.insights = { ...(p.insights || {}), ...insights };
    p.insightsUpdatedAt = new Date().toISOString();
    return p;
  });
  sendJson(res, 200, decoratePost(saved));
});

/** Manuell erfasste Kaufsignale: DM-Anfragen und Kunden, die im Markt darauf ansprechen. */
router.patch('/api/posts/:id/manual-insights', async (req, res, params) => {
  const body = await readBody(req);
  const saved = await update((db) => {
    const post = db.posts.find((p) => p.id === params.id);
    if (!post) return null;
    post.insights = {
      ...(post.insights || {}),
      dm_replies: Number(body.dm_replies) || 0,
      store_visits: Number(body.store_visits) || 0
    };
    return post;
  });
  if (!saved) return sendError(res, 404, 'Post nicht gefunden');
  sendJson(res, 200, decoratePost(saved));
});

/* -------------------------------------------------------------------- Captions */

router.post('/api/captions/generate', async (req, res) => {
  const body = await readBody(req);
  const db = await read();

  let imageBase64 = '';
  let imageMime = 'image/jpeg';
  if (body.imageDataUrl) {
    const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/s.exec(body.imageDataUrl);
    if (m) {
      imageMime = m[1];
      imageBase64 = m[2];
    }
  } else if (body.mediaId) {
    const media = db.media.find((x) => x.id === body.mediaId);
    if (media) {
      imageBase64 = (await fs.readFile(path.join(UPLOAD_DIR, media.filename))).toString('base64');
      imageMime = media.mime;
    }
  }

  const result = await generateCaptions(db.settings, {
    pillar: body.pillar || 'angebot',
    product: body.product || '',
    priceOld: body.priceOld || '',
    priceNew: body.priceNew || '',
    details: body.details || '',
    cta: body.cta || db.settings.defaultCta,
    deadline: body.deadline || '',
    avoid: body.avoid || '',
    variantCount: Math.min(Math.max(Number(body.variantCount) || 3, 1), 5),
    imageBase64,
    imageMime
  });

  await logEvent('ai', `${result.variants.length} Caption-Varianten erzeugt.`, {
    pillar: body.pillar,
    tokens: result.usage
  });
  sendJson(res, 200, result);
});

router.post('/api/captions/review', async (req, res) => {
  const { caption, hashtags = [] } = await readBody(req);
  if (!caption?.trim()) return sendError(res, 400, 'Es wurde kein Text zum Prüfen übergeben.');
  const db = await read();
  sendJson(res, 200, await reviewCaption(db.settings, caption, hashtags));
});

/* ------------------------------------------------------------------- Instagram */

router.get('/api/instagram/check', async (_req, res) => {
  const db = await read();
  const account = await checkConnection(db.settings);
  await logEvent('info', `Instagram-Verbindung geprüft: @${account.username}`);
  sendJson(res, 200, account);
});

router.get('/api/instagram/account-insights', async (_req, res) => {
  const db = await read();
  sendJson(res, 200, await fetchAccountInsights(db.settings, 28));
});

/* -------------------------------------------------------------------- Analytics */

router.get('/api/analytics', async (_req, res) => {
  const db = await read();
  const summary = summarise(db.posts);
  sendJson(res, 200, {
    summary,
    goals: db.settings.goals,
    recommendations: recommendations(summary, db.settings)
  });
});

/* ------------------------------------------------------------------ Vorschau */

router.get('/api/posts/:id/preview', async (_req, res, params) => {
  const db = await read();
  const post = db.posts.find((p) => p.id === params.id);
  if (!post) return sendError(res, 404, 'Post nicht gefunden');
  sendJson(res, 200, { caption: fullCaption(post), length: fullCaption(post).length });
});

/* ---------------------------------------------------------------------- Server */

function decoratePost(post) {
  if (!post) return post;
  return {
    ...post,
    buyerScore: post.insights ? buyerScore(post.insights) : null,
    buyerSignals: post.insights ? buyerSignals(post.insights) : 0,
    signalsPerMille: post.insights ? signalsPerMille(post.insights) : 0
  };
}

function redactSettings(settings) {
  const { igAccessToken, ...rest } = settings;
  return {
    ...rest,
    igAccessToken: '',
    igAccessTokenSet: Boolean(igAccessToken),
    igAccessTokenHint: igAccessToken ? `…${igAccessToken.slice(-6)}` : ''
  };
}

async function loadEnvFile() {
  // Kein dotenv-Paket nötig: .env wird direkt gelesen, falls vorhanden.
  try {
    const raw = await fs.readFile(path.resolve(process.cwd(), '.env'), 'utf8');
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch {
    /* .env ist optional */
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const { pathname } = url;

  try {
    if (pathname.startsWith('/uploads/')) {
      // Öffentlich: Instagram lädt die Bilder von hier herunter.
      const served = await serveStatic(res, UPLOAD_DIR, pathname.slice('/uploads'.length), {
        cache: 'public, max-age=31536000, immutable'
      });
      if (!served) sendError(res, 404, 'Bild nicht gefunden');
      return;
    }

    if (pathname.startsWith('/api/')) {
      const route = router.match(req.method, pathname);
      if (!route) return sendError(res, 404, 'Unbekannter Endpunkt');
      await route.handler(req, res, route.params, url);
      return;
    }

    if (req.method !== 'GET') return sendError(res, 405, 'Methode nicht erlaubt');

    const served = await serveStatic(res, PUBLIC_DIR, pathname === '/' ? '/index.html' : pathname);
    if (!served) await serveStatic(res, PUBLIC_DIR, '/index.html');
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error('[fehler]', err);
    if (!res.headersSent) {
      sendError(res, status, err.message || 'Unerwarteter Fehler', {
        details: err.details ?? undefined
      });
    }
  }
});

server.listen(PORT, HOST, () => {
  console.log(`\n  Instagram-Marketing-Cockpit läuft auf http://localhost:${PORT}\n`);
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log('  Hinweis: ANTHROPIC_API_KEY fehlt – die Textvorschläge sind bis dahin deaktiviert.\n');
  }
  startScheduler();
});

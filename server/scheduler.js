import { read, update, logEvent } from './store.js';
import { publishPost, fetchMediaInsights } from './instagram.js';

const TICK_MS = Number(process.env.SCHEDULER_TICK_MS || 60_000);
const MAX_ATTEMPTS = 3;
const INSIGHTS_REFRESH_MS = 6 * 60 * 60 * 1000; // alle 6 Stunden
const INSIGHTS_WINDOW_MS = 30 * 24 * 60 * 60 * 1000; // Posts der letzten 30 Tage

let timer = null;
let running = false;

function mediaUrl(settings, filename) {
  const base = String(settings.publicBaseUrl || '').replace(/\/+$/, '');
  return `${base}/uploads/${filename}`;
}

export function fullCaption(post) {
  const tags = (post.hashtags || []).join(' ');
  return [post.caption?.trim(), tags].filter(Boolean).join('\n\n');
}

export async function publishNow(postId) {
  const db = await read();
  const post = db.posts.find((p) => p.id === postId);
  if (!post) throw Object.assign(new Error('Post nicht gefunden'), { status: 404 });
  if (post.status === 'published') {
    throw Object.assign(new Error('Dieser Post wurde bereits veröffentlicht.'), { status: 409 });
  }

  const files = post.mediaIds
    .map((id) => db.media.find((m) => m.id === id))
    .filter(Boolean)
    .map((m) => mediaUrl(db.settings, m.filename));

  await update((d) => {
    const p = d.posts.find((x) => x.id === postId);
    p.status = 'publishing';
    p.error = '';
  });

  try {
    const result = await publishPost(db.settings, {
      imageUrls: files,
      caption: fullCaption(post),
      firstComment: post.firstComment,
      altText: post.altText
    });

    await update((d) => {
      const p = d.posts.find((x) => x.id === postId);
      p.status = 'published';
      p.publishedAt = new Date().toISOString();
      p.igMediaId = result.mediaId;
      p.igPermalink = result.permalink;
      p.error = '';
      p.attempts = (p.attempts || 0) + 1;
    });

    await logEvent(
      'publish',
      `Post „${post.title || 'ohne Titel'}" veröffentlicht.`,
      { postId, mediaId: result.mediaId, permalink: result.permalink }
    );

    if (result.commentError) {
      await logEvent('warn', `Erster Kommentar konnte nicht gesetzt werden: ${result.commentError}`, {
        postId
      });
    }
    return result;
  } catch (err) {
    await update((d) => {
      const p = d.posts.find((x) => x.id === postId);
      p.attempts = (p.attempts || 0) + 1;
      p.error = err.message;
      p.status = p.attempts >= MAX_ATTEMPTS ? 'failed' : 'scheduled';
    });
    await logEvent('error', `Veröffentlichung fehlgeschlagen: ${err.message}`, { postId });
    throw err;
  }
}

async function publishDuePosts() {
  const db = await read();
  if (!db.settings.autoPublish) return;

  const now = Date.now();
  const due = db.posts.filter(
    (p) =>
      p.status === 'scheduled' &&
      p.scheduledAt &&
      new Date(p.scheduledAt).getTime() <= now &&
      (p.attempts || 0) < MAX_ATTEMPTS
  );

  for (const post of due) {
    try {
      await publishNow(post.id);
    } catch {
      // Fehler ist bereits protokolliert; nächster Post wird trotzdem versucht.
    }
  }
}

async function refreshInsights() {
  const db = await read();
  if (!db.settings.igAccessToken || !db.settings.igUserId) return;

  const now = Date.now();
  const candidates = db.posts.filter(
    (p) =>
      p.status === 'published' &&
      p.igMediaId &&
      now - new Date(p.publishedAt || 0).getTime() < INSIGHTS_WINDOW_MS &&
      now - new Date(p.insightsUpdatedAt || 0).getTime() > INSIGHTS_REFRESH_MS
  );

  for (const post of candidates.slice(0, 10)) {
    try {
      const insights = await fetchMediaInsights(db.settings, post.igMediaId);
      await update((d) => {
        const p = d.posts.find((x) => x.id === post.id);
        // Manuell erfasste Werte (DM-Anfragen, Kunden im Markt) nicht überschreiben.
        p.insights = { ...(p.insights || {}), ...insights };
        p.insightsUpdatedAt = new Date().toISOString();
      });
    } catch (err) {
      await logEvent('warn', `Insights für einen Post nicht abrufbar: ${err.message}`, {
        postId: post.id
      });
    }
  }
}

async function tick() {
  if (running) return;
  running = true;
  try {
    await publishDuePosts();
    await refreshInsights();
  } catch (err) {
    await logEvent('error', `Fehler im Auto-Posting-Dienst: ${err.message}`);
  } finally {
    running = false;
  }
}

export function startScheduler() {
  if (timer) return;
  timer = setInterval(tick, TICK_MS);
  timer.unref?.();
  tick();
}

export function stopScheduler() {
  if (timer) clearInterval(timer);
  timer = null;
}

/** Nächste freie Termine aus dem Redaktionsplan – Basis für "Regelmäßigkeit". */
export function nextSlots(settings, posts, count = 8, from = new Date()) {
  const slots = (settings.slots || []).filter((s) => s.time && s.weekday !== undefined);
  if (!slots.length) return [];

  const taken = new Set(
    posts
      .filter((p) => p.scheduledAt && p.status !== 'failed')
      .map((p) => new Date(p.scheduledAt).toISOString().slice(0, 16))
  );

  const out = [];
  const cursor = new Date(from);
  cursor.setSeconds(0, 0);

  for (let day = 0; day < 90 && out.length < count; day++) {
    const date = new Date(cursor);
    date.setDate(cursor.getDate() + day);
    const weekday = date.getDay();

    for (const slot of slots.filter((s) => Number(s.weekday) === weekday)) {
      const [h, m] = String(slot.time).split(':').map(Number);
      const when = new Date(date);
      when.setHours(h || 0, m || 0, 0, 0);
      if (when.getTime() <= from.getTime()) continue;

      const key = when.toISOString().slice(0, 16);
      out.push({
        slotId: slot.id,
        pillar: slot.pillar,
        at: when.toISOString(),
        occupied: taken.has(key)
      });
    }
  }

  return out.sort((a, b) => new Date(a.at) - new Date(b.at)).slice(0, count);
}

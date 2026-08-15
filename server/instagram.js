const API_VERSION = process.env.IG_API_VERSION || 'v21.0';
const BASE = `https://graph.facebook.com/${API_VERSION}`;

class InstagramError extends Error {
  constructor(message, details) {
    super(message);
    this.name = 'InstagramError';
    this.status = 502;
    this.details = details;
  }
}

async function call(path, { method = 'GET', params = {}, token }) {
  const url = new URL(`${BASE}/${path}`);
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    if (method === 'GET') url.searchParams.set(key, String(value));
    else body.set(key, String(value));
  }
  if (method === 'GET') url.searchParams.set('access_token', token);
  else body.set('access_token', token);

  const res = await fetch(url, {
    method,
    headers: method === 'GET' ? {} : { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: method === 'GET' ? undefined : body
  });

  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new InstagramError('Antwort von Instagram konnte nicht gelesen werden.', text.slice(0, 400));
  }
  if (!res.ok || json.error) {
    const err = json.error || {};
    throw new InstagramError(
      err.error_user_msg || err.message || `Instagram-API-Fehler (HTTP ${res.status})`,
      { code: err.code, subcode: err.error_subcode, type: err.type }
    );
  }
  return json;
}

export function assertConfigured(settings) {
  const missing = [];
  if (!settings.igUserId) missing.push('Instagram-Business-Konto-ID');
  if (!settings.igAccessToken) missing.push('Access Token');
  if (!settings.publicBaseUrl) missing.push('öffentliche Basis-URL');
  if (missing.length) {
    throw Object.assign(
      new Error(`Instagram ist noch nicht vollständig verbunden. Es fehlt: ${missing.join(', ')}.`),
      { status: 400 }
    );
  }
}

export async function checkConnection(settings) {
  assertConfigured(settings);
  const me = await call(settings.igUserId, {
    token: settings.igAccessToken,
    params: { fields: 'id,username,name,followers_count,media_count,profile_picture_url' }
  });
  return me;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Wartet, bis ein Container von Instagram verarbeitet wurde. */
async function waitForContainer(containerId, token, { attempts = 12, intervalMs = 3000 } = {}) {
  for (let i = 0; i < attempts; i++) {
    const status = await call(containerId, {
      token,
      params: { fields: 'status_code,status' }
    });
    if (status.status_code === 'FINISHED') return;
    if (status.status_code === 'ERROR' || status.status_code === 'EXPIRED') {
      throw new InstagramError(
        `Instagram konnte das Medium nicht verarbeiten (${status.status_code}).`,
        status.status
      );
    }
    await delay(intervalMs);
  }
  throw new InstagramError('Zeitüberschreitung: Instagram hat das Medium nicht rechtzeitig verarbeitet.');
}

/**
 * Veröffentlicht einen Post. `imageUrls` müssen öffentlich erreichbar sein –
 * Instagram lädt die Bilder selbst von dort herunter.
 */
export async function publishPost(settings, { imageUrls, caption, firstComment, altText }) {
  assertConfigured(settings);
  const token = settings.igAccessToken;
  const igUserId = settings.igUserId;

  if (!imageUrls?.length) {
    throw Object.assign(new Error('Der Post enthält kein Bild.'), { status: 400 });
  }

  let creationId;

  if (imageUrls.length === 1) {
    const container = await call(`${igUserId}/media`, {
      method: 'POST',
      token,
      params: { image_url: imageUrls[0], caption, alt_text: altText }
    });
    creationId = container.id;
    await waitForContainer(creationId, token);
  } else {
    const children = [];
    for (const url of imageUrls.slice(0, 10)) {
      const child = await call(`${igUserId}/media`, {
        method: 'POST',
        token,
        params: { image_url: url, is_carousel_item: true }
      });
      await waitForContainer(child.id, token);
      children.push(child.id);
    }
    const container = await call(`${igUserId}/media`, {
      method: 'POST',
      token,
      params: { media_type: 'CAROUSEL', children: children.join(','), caption }
    });
    creationId = container.id;
    await waitForContainer(creationId, token);
  }

  const published = await call(`${igUserId}/media_publish`, {
    method: 'POST',
    token,
    params: { creation_id: creationId }
  });

  const mediaId = published.id;

  let permalink = '';
  try {
    const info = await call(mediaId, { token, params: { fields: 'permalink' } });
    permalink = info.permalink || '';
  } catch {
    /* Permalink ist nice-to-have, kein Grund den Post als fehlgeschlagen zu melden. */
  }

  let commentId = '';
  if (firstComment?.trim()) {
    try {
      const comment = await call(`${mediaId}/comments`, {
        method: 'POST',
        token,
        params: { message: firstComment.trim() }
      });
      commentId = comment.id;
    } catch (err) {
      commentId = '';
      // Erster Kommentar ist optional – Fehler wird vom Aufrufer protokolliert.
      return { mediaId, permalink, commentId, commentError: err.message };
    }
  }

  return { mediaId, permalink, commentId };
}

const MEDIA_METRICS = ['reach', 'likes', 'comments', 'saved', 'shares', 'total_interactions'];
const MEDIA_METRICS_EXTENDED = [...MEDIA_METRICS, 'profile_visits', 'follows', 'profile_activity'];

/** Holt Insights zu einem veröffentlichten Post. */
export async function fetchMediaInsights(settings, mediaId) {
  assertConfigured(settings);
  const token = settings.igAccessToken;

  const tryMetrics = async (metrics) =>
    call(`${mediaId}/insights`, { token, params: { metric: metrics.join(',') } });

  let payload;
  try {
    payload = await tryMetrics(MEDIA_METRICS_EXTENDED);
  } catch {
    // Nicht jeder Medientyp unterstützt profile_visits/follows – dann der Basissatz.
    payload = await tryMetrics(MEDIA_METRICS);
  }

  const out = {};
  for (const item of payload.data || []) {
    const value = item.values?.[0]?.value;
    out[item.name] = typeof value === 'object' && value !== null
      ? Object.values(value).reduce((a, b) => a + (Number(b) || 0), 0)
      : Number(value) || 0;
  }
  return out;
}

/** Konto-Insights für den Reichweiten-/Käufer-Trichter. */
export async function fetchAccountInsights(settings, days = 28) {
  assertConfigured(settings);
  const token = settings.igAccessToken;
  const since = Math.floor((Date.now() - days * 86400000) / 1000);
  const until = Math.floor(Date.now() / 1000);

  const result = { reach: 0, profileViews: 0, websiteClicks: 0, accountsEngaged: 0 };
  const map = {
    reach: 'reach',
    profile_views: 'profileViews',
    website_clicks: 'websiteClicks',
    accounts_engaged: 'accountsEngaged'
  };

  for (const [metric, key] of Object.entries(map)) {
    try {
      const payload = await call(`${settings.igUserId}/insights`, {
        token,
        params: { metric, period: 'day', metric_type: 'total_value', since, until }
      });
      const entry = payload.data?.[0];
      result[key] = Number(entry?.total_value?.value ?? entry?.values?.[0]?.value ?? 0) || 0;
    } catch {
      result[key] = null; // Metrik für dieses Konto nicht verfügbar
    }
  }
  return result;
}

export { InstagramError };

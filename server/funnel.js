/**
 * Käufer-Trichter: bewertet Posts danach, ob sie Kaufabsicht auslösen –
 * nicht danach, ob sie Likes sammeln.
 *
 * Likes zählen bewusst mit 0. Ein Like kostet nichts und sagt nichts über
 * Kaufabsicht aus. Alles, was Aufwand oder einen Schritt Richtung Markt
 * bedeutet, wird höher gewichtet.
 */
export const INTENT_WEIGHTS = {
  likes: 0,
  comments: 2,
  saved: 3,
  shares: 3,
  follows: 2,
  profile_visits: 5,
  website_clicks: 8,
  dm_replies: 10,
  store_visits: 15
};

export const METRIC_LABELS = {
  reach: 'Reichweite',
  likes: 'Likes',
  comments: 'Kommentare',
  saved: 'Gespeichert',
  shares: 'Geteilt',
  follows: 'Neue Follower',
  profile_visits: 'Profilaufrufe',
  website_clicks: 'Link-Klicks',
  dm_replies: 'DM-Anfragen',
  store_visits: 'Kunden im Markt'
};

export function buyerSignals(insights = {}) {
  let total = 0;
  for (const [key, weight] of Object.entries(INTENT_WEIGHTS)) {
    if (!weight) continue;
    total += (Number(insights[key]) || 0) * weight;
  }
  return total;
}

export function rawIntentActions(insights = {}) {
  return Object.keys(INTENT_WEIGHTS)
    .filter((k) => INTENT_WEIGHTS[k] > 0)
    .reduce((sum, k) => sum + (Number(insights[k]) || 0), 0);
}

/**
 * Käufer-Score 0–100: gewichtete Kaufsignale je 1.000 erreichte Personen.
 *
 * Bewusst eine Sättigungskurve statt einer Geraden: mit einer Geraden landen
 * alle brauchbaren Beiträge bei 100 und der Score kann nicht mehr zwischen
 * "gut" und "sehr gut" unterscheiden. HALF_POINT ist der Wert, ab dem ein
 * Beitrag als solide gilt.
 *
 * Grobe Einordnung:
 *   ~50 Signale/1.000  →  22  (viele Likes, kaum Kaufabsicht)
 *   ~200 Signale/1.000 →  63  (solider Verkaufspost)
 *   ~350 Signale/1.000 →  83  (starker Verkaufspost)
 *   ~500 Signale/1.000 →  92  (Ausreißer nach oben)
 */
const HALF_POINT = 200;

export function buyerScore(insights = {}) {
  const reach = Number(insights.reach) || 0;
  if (reach < 50) return null; // zu wenig Daten für eine belastbare Aussage
  const perMille = (buyerSignals(insights) / reach) * 1000;
  return Math.max(0, Math.min(100, Math.round(100 * (1 - Math.exp(-perMille / HALF_POINT)))));
}

/** Gewichtete Kaufsignale je 1.000 erreichte Personen – die Rohzahl hinter dem Score. */
export function signalsPerMille(insights = {}) {
  const reach = Number(insights.reach) || 0;
  if (!reach) return 0;
  return Number(((buyerSignals(insights) / reach) * 1000).toFixed(1));
}

/** Verhältnis Fans zu Käufern: wie viele Likes kommen auf ein echtes Kaufsignal? */
export function fanToBuyerRatio(insights = {}) {
  const actions = rawIntentActions(insights);
  const likes = Number(insights.likes) || 0;
  if (!actions) return likes ? Infinity : null;
  return Number((likes / actions).toFixed(1));
}

export function summarise(posts) {
  const published = posts.filter((p) => p.status === 'published' && p.insights);

  const totals = {};
  for (const key of Object.keys(METRIC_LABELS)) {
    totals[key] = published.reduce((sum, p) => sum + (Number(p.insights[key]) || 0), 0);
  }

  const scored = published
    .map((p) => ({ post: p, score: buyerScore(p.insights) }))
    .filter((entry) => entry.score !== null)
    .sort((a, b) => b.score - a.score);

  const byPillar = {};
  for (const p of published) {
    const pillar = p.pillar || 'sonstiges';
    byPillar[pillar] ??= { pillar, posts: 0, reach: 0, signals: 0 };
    byPillar[pillar].posts += 1;
    byPillar[pillar].reach += Number(p.insights.reach) || 0;
    byPillar[pillar].signals += buyerSignals(p.insights);
  }
  for (const entry of Object.values(byPillar)) {
    entry.signalsPerMille = entry.reach ? Number(((entry.signals / entry.reach) * 1000).toFixed(1)) : 0;
  }

  const byHour = {};
  for (const p of published) {
    if (!p.publishedAt) continue;
    const hour = new Date(p.publishedAt).getHours();
    byHour[hour] ??= { hour, posts: 0, reach: 0, signals: 0 };
    byHour[hour].posts += 1;
    byHour[hour].reach += Number(p.insights.reach) || 0;
    byHour[hour].signals += buyerSignals(p.insights);
  }
  for (const entry of Object.values(byHour)) {
    entry.signalsPerMille = entry.reach ? Number(((entry.signals / entry.reach) * 1000).toFixed(1)) : 0;
  }

  return {
    postCount: published.length,
    totals,
    totalSignals: published.reduce((s, p) => s + buyerSignals(p.insights), 0),
    averageScore: scored.length
      ? Math.round(scored.reduce((s, e) => s + e.score, 0) / scored.length)
      : null,
    fanToBuyerRatio: fanToBuyerRatio(totals),
    best: scored.slice(0, 3).map((e) => ({ id: e.post.id, title: e.post.title, score: e.score })),
    worst: scored.slice(-3).reverse().map((e) => ({ id: e.post.id, title: e.post.title, score: e.score })),
    byPillar: Object.values(byPillar).sort((a, b) => b.signalsPerMille - a.signalsPerMille),
    byHour: Object.values(byHour).sort((a, b) => a.hour - b.hour)
  };
}

/** Konkrete, aus den Zahlen abgeleitete Empfehlungen. */
export function recommendations(summary, settings) {
  const out = [];
  const t = summary.totals;

  if (!summary.postCount) {
    out.push({
      level: 'info',
      title: 'Noch keine Auswertung möglich',
      text: 'Sobald der erste Post veröffentlicht und die Insights abgerufen sind, erscheint hier die Auswertung.'
    });
    return out;
  }

  if (summary.fanToBuyerRatio !== null && summary.fanToBuyerRatio > 12) {
    out.push({
      level: 'warn',
      title: 'Viele Likes, wenig Kaufsignale',
      text: `Auf jedes Kaufsignal kommen ${summary.fanToBuyerRatio} Likes. Die Beiträge gefallen, führen aber nicht in den Markt. Setze in den nächsten Posts genau eine klare Handlungsaufforderung ans Ende und nenne Preis und Verfügbarkeit im ersten Satz.`
    });
  }

  if (t.reach && t.profile_visits / t.reach < 0.01) {
    out.push({
      level: 'warn',
      title: 'Profilaufrufe unter 1 % der Reichweite',
      text: 'Die Beiträge werden gesehen, aber niemand klickt weiter. Nenne den Ortsbezug direkt in der ersten Zeile und verweise in der Caption ausdrücklich aufs Profil ("Adresse und Öffnungszeiten im Profil").'
    });
  }

  if (t.profile_visits && t.website_clicks / t.profile_visits < 0.15) {
    out.push({
      level: 'warn',
      title: 'Profil konvertiert schwach',
      text: 'Von den Profilbesuchern klickt weniger als jeder siebte weiter. Prüfe Bio und Link: Der Link sollte direkt auf das beworbene Gerät oder die Aktionsseite zeigen, nicht auf die Startseite.'
    });
  }

  if (t.saved && t.saved > t.likes * 0.15) {
    out.push({
      level: 'good',
      title: 'Hohe Speicherrate',
      text: 'Die Inhalte werden auffällig oft gespeichert – ein starkes Kaufabsichts-Signal. Produziere mehr von diesem Typ und ergänze eine Erinnerung ("Gespeichert? Dann komm bis Samstag vorbei").'
    });
  }

  const bestPillar = summary.byPillar[0];
  const worstPillar = summary.byPillar[summary.byPillar.length - 1];
  if (bestPillar && worstPillar && bestPillar !== worstPillar && bestPillar.signalsPerMille > 0) {
    out.push({
      level: 'info',
      title: `Beste Content-Säule: ${bestPillar.pillar}`,
      text: `"${bestPillar.pillar}" erzeugt ${bestPillar.signalsPerMille} gewichtete Kaufsignale je 1.000 erreichte Personen, "${worstPillar.pillar}" nur ${worstPillar.signalsPerMille}. Verschiebe einen festen Slot pro Woche auf die stärkere Säule.`
    });
  }

  const bestHour = [...summary.byHour].sort((a, b) => b.signalsPerMille - a.signalsPerMille)[0];
  if (bestHour && bestHour.posts >= 2) {
    out.push({
      level: 'info',
      title: `Stärkste Uhrzeit: ${String(bestHour.hour).padStart(2, '0')}:00`,
      text: `Posts um ${String(bestHour.hour).padStart(2, '0')}:00 Uhr erzeugen die meisten Kaufsignale je Reichweite. Lege die festen Slots im Redaktionsplan darauf.`
    });
  }

  const goals = settings.goals || {};
  if (goals.reach && t.reach < goals.reach) {
    out.push({
      level: 'info',
      title: 'Reichweitenziel noch nicht erreicht',
      text: `${t.reach.toLocaleString('de-DE')} von ${Number(goals.reach).toLocaleString('de-DE')} erreichten Personen. Erhöhe die Frequenz auf mindestens drei feste Slots pro Woche – Regelmäßigkeit wirkt hier stärker als einzelne Ausreißer.`
    });
  }

  return out;
}

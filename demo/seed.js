/**
 * Legt einen Demo-Datenbestand an, damit die Oberfläche beim ersten Start
 * nicht leer ist: Marktprofil, drei Produktbilder, fünf Beiträge in
 * verschiedenen Zuständen und Beispiel-Insights.
 *
 *   npm run demo            – nur anlegen, wenn noch keine Daten da sind
 *   npm run demo -- --force – vorhandene Daten überschreiben
 *
 * Der Server hält die Datenbank im Speicher. Läuft er gerade, muss er nach
 * dem Einspielen neu gestartet werden.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { MOTIFS } from './png.js';
import { UPLOAD_DIR, newId, read, saveImage, update } from '../server/store.js';

const FORCE = process.argv.includes('--force');

/** Termin relativ zu heute, auf eine volle halbe Stunde gelegt. */
function day(offset, hour, minute = 30) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

/**
 * Nächster Termin für einen Wochentag-Slot. Der geplante Demo-Beitrag muss
 * genau auf einem der Slots liegen, sonst zeigt der Redaktionsplan lauter
 * freie Slots und daneben einen Beitrag ohne Bezug dazu.
 */
function nextSlot(weekday, time) {
  const [hour, minute] = time.split(':').map(Number);
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  let ahead = (weekday - d.getDay() + 7) % 7;
  if (ahead === 0 && d.getTime() <= Date.now()) ahead = 7;
  d.setDate(d.getDate() + ahead);
  return d.toISOString();
}

const SETTINGS = {
  businessName: 'Expert Kröhnke',
  city: 'Buxtehude',
  branch: 'Elektrofachmarkt',
  website: 'https://expert-kroehnke.de',
  phone: '04161 / 55 44 0',
  brandColor: '#e2001a',
  audience:
    'Käufer aus Buxtehude und dem Umland, 30–65 Jahre, die ein konkretes Gerät suchen und Beratung vor Ort schätzen.',
  usp: 'Beratung vor Ort, Lieferung und Aufbau am nächsten Tag, Altgerät-Mitnahme, alles sofort verfügbar.',
  defaultCta: 'Heute im Markt vorbeikommen',
  tone: 'direkt',
  goals: { reach: 15000, profileVisits: 600, clicks: 200, buyerSignals: 60 },
  slots: [
    { id: 'slot-mo', weekday: 1, time: '18:30', pillar: 'angebot' },
    { id: 'slot-mi', weekday: 3, time: '12:00', pillar: 'beratung' },
    { id: 'slot-fr', weekday: 5, time: '17:00', pillar: 'aktion' }
  ]
};

const IMAGES = [
  { key: 'waschmaschine', label: 'Waschmaschine Bosch WAN28K43' },
  { key: 'kuehlschrank', label: 'Kühlschrank Freistehend' },
  { key: 'fernseher', label: 'Fernseher 65 Zoll' }
];

const POSTS = [
  {
    title: 'Waschmaschine Bosch WAN28K43 für 799 €',
    pillar: 'angebot',
    image: 0,
    product: 'Waschmaschine Bosch WAN28K43, 8 kg',
    priceOld: '999 €',
    priceNew: '799 €',
    caption:
      'Waschmaschine kaputt und die Wäsche stapelt sich?\n\n' +
      'Bosch WAN28K43, 8 kg, Energieklasse A – bei uns diese Woche für 799 € statt 999 €.\n\n' +
      'Wir liefern morgen, bauen auf und nehmen dein Altgerät mit. Kein Termin in drei Wochen, kein Karton im Flur.\n\n' +
      'Noch 4 Stück auf Lager. Komm heute im Markt vorbei.',
    hashtags: [
      '#waschmaschine', '#buxtehude', '#bosch', '#hausgeraete', '#elektrofachmarkt',
      '#altesland', '#waschmaschinekaufen', '#lieferungundaufbau', '#energieklassea',
      '#beratungvorort', '#altgeraetmitnahme', '#stadeland'
    ],
    firstComment:
      'Expert Kröhnke, Bahnhofstraße 12, Buxtehude · Mo–Fr 9–19 Uhr, Sa 9–16 Uhr · 04161 / 55 44 0',
    altText: 'Weiße Waschmaschine mit schwarzem Bedienfeld vor heller Wand im Verkaufsraum',
    publishedAt: day(-6, 18),
    insights: {
      reach: 4200, likes: 180, comments: 12, saved: 64, shares: 22,
      follows: 9, profile_visits: 130, website_clicks: 41, dm_replies: 7, store_visits: 3
    }
  },
  {
    title: 'Welche Kühlschrankgröße passt in meine Küche?',
    pillar: 'beratung',
    image: 1,
    product: 'Kühlschränke, freistehend und Einbau',
    caption:
      'Die häufigste Frage bei uns im Markt: Wie groß muss der Kühlschrank sein?\n\n' +
      'Faustregel: 100 Liter für die erste Person im Haushalt, 50 Liter für jede weitere. Zwei Personen kommen also mit 150 Litern hin – wer nur einmal pro Woche einkauft, plant 30 Liter drauf.\n\n' +
      'Wichtiger als die Liter ist die Nische: miss Höhe, Breite und Tiefe, bevor du losfährst. Wir haben Geräte für jede Standardnische da.\n\n' +
      'Bring die Maße mit, wir finden das passende Gerät.',
    hashtags: [
      '#kuehlschrank', '#buxtehude', '#kuechenplanung', '#hausgeraete', '#beratung',
      '#altesland', '#elektrofachmarkt', '#einbaugeraete', '#kuecheneinrichtung',
      '#stade', '#haushaltsgeraete', '#kuehlschrankkaufen'
    ],
    firstComment: 'Maße unsicher? Schick uns ein Foto der Nische per DM, wir sagen dir, was passt.',
    altText: 'Freistehender Kühlschrank in Edelstahloptik im Ausstellungsraum',
    publishedAt: day(-4, 18),
    insights: {
      reach: 2600, likes: 95, comments: 19, saved: 88, shares: 14,
      follows: 6, profile_visits: 96, website_clicks: 28, dm_replies: 11, store_visits: 5
    }
  },
  {
    // Bewusst schwach: zeigt in der Auswertung, wie ein reiner Fan-Post abschneidet.
    title: 'Unser Team im Lager',
    pillar: 'team',
    image: 2,
    caption: 'Montagmorgen im Lager – hier landet alles, was diese Woche ausgeliefert wird.\n\nSchön, dass ihr uns folgt!',
    hashtags: ['#team', '#buxtehude', '#einzelhandel', '#lokal', '#elektrofachmarkt'],
    firstComment: '',
    altText: 'Blick in das Lager des Marktes',
    publishedAt: day(-2, 12),
    insights: {
      reach: 3100, likes: 410, comments: 8, saved: 4, shares: 2,
      follows: 3, profile_visits: 22, website_clicks: 2, dm_replies: 0, store_visits: 0
    }
  },
  {
    title: 'Fernseher-Aktionswochenende',
    pillar: 'aktion',
    image: 2,
    product: 'Vorführgeräte 55 bis 65 Zoll',
    priceNew: 'ab 599 €',
    deadline: 'nur an diesem Wochenende',
    caption:
      '65 Zoll für unter 600 € – nur an diesem Wochenende.\n\n' +
      'Wir haben acht Vorführgeräte aussortiert: alle geprüft, alle mit voller Garantie, alle mindestens 200 € unter Neupreis.\n\n' +
      'Wer zuerst kommt, sucht zuerst aus. Samstag ab 9 Uhr im Markt.',
    hashtags: [
      '#fernseher', '#buxtehude', '#aktion', '#vorfuehrgeraete', '#4ktv',
      '#altesland', '#elektrofachmarkt', '#wochenendangebot', '#tvkaufen', '#stade'
    ],
    firstComment: 'Alle acht Geräte findest du ab Samstag vorne im Eingangsbereich.',
    altText: 'Großer Fernseher auf einem Standfuß im Verkaufsraum',
    // Liegt bewusst auf dem Freitags-Slot der Säule „aktion".
    scheduledAt: nextSlot(5, '17:00')
  },
  {
    title: 'Trockner: Wärmepumpe oder Kondens?',
    pillar: 'beratung',
    image: 0,
    caption: 'Entwurf – Verbrauchswerte und Preise vom Montag noch ergänzen.',
    hashtags: [],
    firstComment: '',
    altText: ''
  }
];

async function main() {
  const db = await read();

  if ((db.posts.length || db.media.length) && !FORCE) {
    console.error(
      '\n  Es sind bereits Daten vorhanden. Zum Überschreiben:\n\n' +
        '    npm run demo -- --force\n'
    );
    process.exitCode = 1;
    return;
  }

  if (FORCE) {
    for (const media of db.media) {
      await fs.rm(path.join(UPLOAD_DIR, media.filename), { force: true });
    }
    await update((d) => {
      d.posts = [];
      d.media = [];
      d.events = [];
    });
  }

  process.stdout.write('  Bilder werden erzeugt ');
  const mediaIds = [];
  for (const { key, label } of IMAGES) {
    const png = MOTIFS[key]().toPngBuffer();
    const file = await saveImage(png.toString('base64'), 'image/png');
    const record = {
      id: file.id,
      filename: file.filename,
      mime: 'image/png',
      bytes: file.bytes,
      width: 1080,
      height: 1350,
      label,
      createdAt: new Date().toISOString()
    };
    await update((d) => d.media.unshift(record));
    mediaIds.push(file.id);
    process.stdout.write('·');
  }
  console.log(' fertig');

  await update((d) => {
    d.settings = { ...d.settings, ...SETTINGS };

    for (const p of POSTS) {
      const published = Boolean(p.insights);
      d.posts.push({
        id: newId('post'),
        title: p.title,
        caption: p.caption,
        hashtags: p.hashtags || [],
        firstComment: p.firstComment || '',
        altText: p.altText || '',
        pillar: p.pillar,
        cta: SETTINGS.defaultCta,
        product: p.product || '',
        priceOld: p.priceOld || '',
        priceNew: p.priceNew || '',
        deadline: p.deadline || '',
        notes: '',
        mediaIds: [mediaIds[p.image]],
        status: published ? 'published' : p.scheduledAt ? 'scheduled' : 'draft',
        scheduledAt: p.scheduledAt || p.publishedAt || '',
        publishedAt: p.publishedAt || '',
        // Demo-Daten: keine echten Instagram-IDs, deshalb kein Permalink.
        igMediaId: '',
        igPermalink: '',
        attempts: 0,
        error: '',
        insights: p.insights || {},
        insightsUpdatedAt: published ? p.publishedAt : '',
        createdAt: new Date().toISOString()
      });
    }

    d.posts.reverse();
    d.events.unshift({
      id: newId('ev'),
      type: 'info',
      message: 'Demo-Datenbestand eingespielt.',
      meta: {},
      at: new Date().toISOString()
    });
  });

  const after = await read();
  console.log(`
  Demo-Daten angelegt:
    Marktprofil   ${SETTINGS.businessName}, ${SETTINGS.city}
    Bilder        ${after.media.length}
    Beiträge      ${after.posts.length} (3 veröffentlicht, 1 geplant, 1 Entwurf)

  Jetzt starten:  npm start   →  http://localhost:${process.env.PORT || 4000}

  Hinweis: Instagram-Zugangsdaten sind bewusst nicht gesetzt – die Beiträge
  gelten als veröffentlicht, wurden aber nirgends gepostet.
`);
}

main().catch((err) => {
  console.error('\n  Fehler beim Anlegen der Demo-Daten:', err.message, '\n');
  process.exitCode = 1;
});

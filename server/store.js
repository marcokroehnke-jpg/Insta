import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.resolve(process.cwd(), 'data');

export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const DB_FILE = path.join(DATA_DIR, 'db.json');

const DEFAULT_DB = {
  version: 1,
  settings: {
    businessName: 'Mein Fachmarkt',
    city: '',
    branch: 'Elektrofachmarkt',
    website: '',
    phone: '',
    brandColor: '#e2001a',
    accentColor: '#111111',
    logoDataUrl: '',
    audience: 'Käufer aus der Region, 30–65 Jahre, die ein konkretes Gerät suchen und Beratung vor Ort schätzen.',
    tone: 'direkt',
    usp: 'Beratung vor Ort, Lieferung und Aufbau, Altgerät-Mitnahme, sofort verfügbar.',
    defaultCta: 'Heute im Markt vorbeikommen',
    // Instagram Graph API
    igUserId: '',
    igAccessToken: '',
    publicBaseUrl: '',
    autoPublish: false,
    // Redaktionsplan
    slots: [
      { id: 'slot-mo', weekday: 1, time: '18:30', pillar: 'angebot' },
      { id: 'slot-mi', weekday: 3, time: '12:00', pillar: 'beratung' },
      { id: 'slot-fr', weekday: 5, time: '17:00', pillar: 'aktion' }
    ],
    goals: { reach: 15000, profileVisits: 600, clicks: 200, buyerSignals: 60 }
  },
  media: [],
  posts: [],
  events: []
};

let db = null;
let writeQueue = Promise.resolve();

export function newId(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}${crypto.randomBytes(4).toString('hex')}`;
}

async function ensureDirs() {
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
}

function mergeDefaults(loaded) {
  return {
    ...DEFAULT_DB,
    ...loaded,
    settings: {
      ...DEFAULT_DB.settings,
      ...(loaded.settings || {}),
      goals: { ...DEFAULT_DB.settings.goals, ...((loaded.settings || {}).goals || {}) },
      slots: (loaded.settings || {}).slots || DEFAULT_DB.settings.slots
    },
    media: loaded.media || [],
    posts: loaded.posts || [],
    events: loaded.events || []
  };
}

export async function load() {
  if (db) return db;
  await ensureDirs();
  try {
    const raw = await fs.readFile(DB_FILE, 'utf8');
    db = mergeDefaults(JSON.parse(raw));
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
    db = structuredClone(DEFAULT_DB);
    await persist();
  }
  return db;
}

function persist() {
  // Serialise writes so two concurrent requests can't interleave a half-written file.
  writeQueue = writeQueue.then(async () => {
    await ensureDirs();
    const tmp = `${DB_FILE}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(db, null, 2), 'utf8');
    await fs.rename(tmp, DB_FILE);
  });
  return writeQueue;
}

export async function read() {
  return load();
}

export async function update(mutator) {
  const current = await load();
  const result = await mutator(current);
  await persist();
  return result;
}

export async function logEvent(type, message, meta = {}) {
  await update((d) => {
    d.events.unshift({
      id: newId('ev'),
      type,
      message,
      meta,
      at: new Date().toISOString()
    });
    d.events = d.events.slice(0, 300);
  });
}

export async function saveImage(base64, mime = 'image/jpeg') {
  await ensureDirs();
  const ext = mime === 'image/png' ? 'png' : 'jpg';
  const id = newId('img');
  const filename = `${id}.${ext}`;
  const buf = Buffer.from(base64, 'base64');
  await fs.writeFile(path.join(UPLOAD_DIR, filename), buf);
  return { id, filename, mime, bytes: buf.length };
}

export async function deleteImage(filename) {
  if (!filename || filename.includes('/') || filename.includes('\\')) return;
  await fs.rm(path.join(UPLOAD_DIR, filename), { force: true });
}

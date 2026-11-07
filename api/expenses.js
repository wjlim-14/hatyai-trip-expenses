import { Redis } from '@upstash/redis';
import { randomUUID } from 'node:crypto';

// Vercel's Upstash integration sets KV_REST_API_*; a direct Upstash setup uses UPSTASH_REDIS_REST_*.
// A custom prefix chosen when connecting (e.g. STORAGE_KV_REST_API_URL) is found too.
const findEnv = (...suffixes) => {
  for (const sfx of suffixes) {
    if (process.env[sfx]) return process.env[sfx];
    const k = Object.keys(process.env).find((n) => n.endsWith('_' + sfx) && process.env[n]);
    if (k) return process.env[k];
  }
  return '';
};
const url = findEnv('KV_REST_API_URL', 'UPSTASH_REDIS_REST_URL');
const token = findEnv('KV_REST_API_TOKEN', 'UPSTASH_REDIS_REST_TOKEN');
const redis = url && token ? new Redis({ url, token }) : null;

const KEY = 'hatyai:expenses';
const SEEDED = 'hatyai:seeded';
const CATS = ['Food', 'Transport', 'Shopping', 'Hotel', 'Activities', 'Drinks & snacks', 'Other'];
const SEED = [
  { id: 'lunch-pork-leg-rice', date: '2026-11-07', description: '秋哥 pork leg rice (lunch)', category: 'Food', amount: 820, people: 4, paidBy: '', createdAt: '2026-11-07T06:40:00.000Z', updatedAt: '2026-11-07T06:40:00.000Z' },
  { id: 'maxim-hotel-central', date: '2026-11-07', description: 'Maxim ride: hotel to Central Festival', category: 'Transport', amount: 126, people: 4, paidBy: '', createdAt: '2026-11-07T06:41:00.000Z', updatedAt: '2026-11-07T06:41:00.000Z' }
];

function parse(v) {
  if (typeof v === 'string') { try { return JSON.parse(v); } catch { return null; } }
  return v && typeof v === 'object' ? v : null;
}

function names(v) {
  if (!Array.isArray(v)) return [];
  const seen = new Set();
  return v.map((x) => String(x).trim().slice(0, 30)).filter((x) => x && !seen.has(x) && seen.add(x)).slice(0, 50);
}

function loc(body) {
  const lat = Number(body.lat), lng = Number(body.lng);
  if (body.lat === null || body.lat === undefined || body.lat === '' || !isFinite(lat) || !isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return { lat: null, lng: null, acc: 0, place: String(body.place || '').trim().slice(0, 120) };
  }
  return {
    lat: Math.round(lat * 1e6) / 1e6,
    lng: Math.round(lng * 1e6) / 1e6,
    acc: Math.max(0, Math.min(100000, Math.round(Number(body.acc) || 0))),
    place: String(body.place || '').trim().slice(0, 120)
  };
}

function validate(body) {
  if (!body || typeof body !== 'object') return { error: 'Send the expense as JSON.' };
  const amount = Math.round(Number(body.amount) * 100) / 100;
  const ticked = names(body.members).length;
  const people = ticked || Math.round(Number(body.people));
  const date = String(body.date || '');
  if (!(amount > 0) || amount > 10000000) return { error: 'Enter an amount above 0.' };
  if (!(people >= 1) || people > 500) return { error: 'Split between 1 and 500 people.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: 'Pick a day for the expense.' };
  return {
    data: {
      date,
      description: String(body.description || '').trim().slice(0, 200),
      category: CATS.includes(body.category) ? body.category : 'Other',
      amount,
      people,
      paidBy: String(body.paidBy || '').trim().slice(0, 60),
      members: names(body.members),
      currency: body.currency === 'MYR' ? 'MYR' : 'THB',
      fx: Number(body.fx) > 0.5 && Number(body.fx) < 100 ? Math.round(Number(body.fx) * 10000) / 10000 : 0,
      ...loc(body)
    }
  };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!redis) {
    return res.status(503).json({ error: 'The database isn’t connected yet. In Vercel, open this project’s Storage tab, add Upstash Redis, then redeploy.' });
  }
  try {
    if (req.method === 'GET') {
      if (await redis.set(SEEDED, '1', { nx: true })) {
        const seed = {};
        SEED.forEach(({ id, ...rest }) => { seed[id] = JSON.stringify(rest); });
        await redis.hset(KEY, seed);
      }
      const all = (await redis.hgetall(KEY)) || {};
      const items = Object.entries(all)
        .map(([id, v]) => { const d = parse(v); return d ? { id, ...d } : null; })
        .filter(Boolean);
      return res.status(200).json({ items });
    }

    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = null; } }
    const id = typeof req.query.id === 'string' ? req.query.id.slice(0, 80) : '';
    const now = new Date().toISOString();

    if (req.method === 'POST') {
      const v = validate(body);
      if (v.error) return res.status(400).json({ error: v.error });
      const newId = randomUUID();
      const item = { ...v.data, createdAt: now, updatedAt: now };
      await redis.hset(KEY, { [newId]: JSON.stringify(item) });
      return res.status(201).json({ item: { id: newId, ...item } });
    }

    if (req.method === 'PUT') {
      if (!id) return res.status(400).json({ error: 'Missing expense id.' });
      const old = parse(await redis.hget(KEY, id));
      if (!old) return res.status(404).json({ error: 'That expense was deleted by someone else.' });
      const v = validate(body);
      if (v.error) return res.status(400).json({ error: v.error });
      const item = { ...v.data, createdAt: old.createdAt || now, updatedAt: now };
      await redis.hset(KEY, { [id]: JSON.stringify(item) });
      return res.status(200).json({ item: { id, ...item } });
    }

    if (req.method === 'DELETE') {
      if (!id) return res.status(400).json({ error: 'Missing expense id.' });
      await redis.hdel(KEY, id);
      return res.status(200).json({ ok: true });
    }

    res.setHeader('Allow', 'GET, POST, PUT, DELETE');
    return res.status(405).json({ error: 'Method not allowed.' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'The database didn’t respond. Try again in a moment.' });
  }
}

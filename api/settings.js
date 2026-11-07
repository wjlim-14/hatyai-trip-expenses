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

const SETTINGS = 'hatyai:settings';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!redis) return res.status(503).json({ error: 'The database isn’t connected yet.' });
  try {
    if (req.method === 'GET') {
      const v = await redis.get(SETTINGS);
      const o = typeof v === 'string' ? JSON.parse(v) : (v || {});
      return res.status(200).json({ rate: Number(o.rate) > 0 ? Number(o.rate) : null, updatedAt: o.updatedAt || '' });
    }
    if (req.method === 'PUT') {
      let body = req.body;
      if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = null; } }
      const rate = Math.round(Number(body && body.rate) * 10000) / 10000;
      if (!(rate > 1 && rate < 50)) return res.status(400).json({ error: 'Enter how many baht you get for RM 1, e.g. 7.5.' });
      const o = { rate, updatedAt: new Date().toISOString() };
      await redis.set(SETTINGS, JSON.stringify(o));
      return res.status(200).json(o);
    }
    res.setHeader('Allow', 'GET, PUT');
    return res.status(405).json({ error: 'Method not allowed.' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'The database didn’t respond. Try again in a moment.' });
  }
}

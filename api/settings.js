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
    const read = async () => { const v = await redis.get(SETTINGS); return typeof v === 'string' ? JSON.parse(v) : (v || {}); };
    const out = (o) => ({ rate: Number(o.rate) > 0 ? Number(o.rate) : null, members: Array.isArray(o.members) ? o.members : [], dailyBudget: Number(o.dailyBudget) > 0 ? Number(o.dailyBudget) : null, groups: Array.isArray(o.groups) ? o.groups : [], updatedAt: o.updatedAt || '' });
    if (req.method === 'GET') return res.status(200).json(out(await read()));
    if (req.method === 'PUT') {
      let body = req.body;
      if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = null; } }
      if (!body || typeof body !== 'object') return res.status(400).json({ error: 'Send the settings as JSON.' });
      const o = await read();
      if ('rate' in body && body.rate !== null && body.rate !== '') {
        const rate = Math.round(Number(body.rate) * 10000) / 10000;
        if (!(rate > 1 && rate < 50)) return res.status(400).json({ error: 'Enter how many baht you get for RM 1, e.g. 7.5.' });
        o.rate = rate;
      }
      if (Array.isArray(body.members)) {
        const seen = new Set();
        o.members = body.members.map((x) => String(x).trim().slice(0, 30)).filter((x) => x && !seen.has(x.toLowerCase()) && seen.add(x.toLowerCase())).slice(0, 50);
      }
      if (Array.isArray(body.groups)) {
        const known = new Set(o.members || []);
        o.groups = body.groups.slice(0, 20).map((g) => ({
          name: String((g && g.name) || '').trim().slice(0, 30),
          members: Array.isArray(g && g.members) ? [...new Set(g.members.map((x) => String(x).trim()).filter((x) => known.has(x)))] : []
        })).filter((g) => g.name && g.members.length);
      }
      if ('dailyBudget' in body) {
        const b = Number(body.dailyBudget);
        o.dailyBudget = b > 0 && b < 10000000 ? Math.round(b * 100) / 100 : 0;
      }
      o.updatedAt = new Date().toISOString();
      await redis.set(SETTINGS, JSON.stringify(o));
      return res.status(200).json(out(o));
    }
    res.setHeader('Allow', 'GET, PUT');
    return res.status(405).json({ error: 'Method not allowed.' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'The database didn’t respond. Try again in a moment.' });
  }
}

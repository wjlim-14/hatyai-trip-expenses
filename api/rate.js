// Today's MYR -> THB rate, from free public sources (first one that answers wins).
const SOURCES = [
  async () => {
    const j = await (await fetch('https://api.frankfurter.dev/v1/latest?base=MYR&symbols=THB', { signal: AbortSignal.timeout(4000) })).json();
    return { rate: j.rates && j.rates.THB, date: j.date, source: 'ECB via Frankfurter' };
  },
  async () => {
    const j = await (await fetch('https://api.frankfurter.app/latest?from=MYR&to=THB', { signal: AbortSignal.timeout(4000) })).json();
    return { rate: j.rates && j.rates.THB, date: j.date, source: 'ECB via Frankfurter' };
  },
  async () => {
    const j = await (await fetch('https://open.er-api.com/v6/latest/MYR', { signal: AbortSignal.timeout(4000) })).json();
    return { rate: j.rates && j.rates.THB, date: String(j.time_last_update_utc || '').slice(5, 16), source: 'ExchangeRate-API' };
  }
];

export default async function handler(req, res) {
  for (const get of SOURCES) {
    try {
      const v = await get();
      const rate = Number(v.rate);
      if (rate > 1 && rate < 50) {
        res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
        return res.status(200).json({ rate: Math.round(rate * 10000) / 10000, date: v.date || '', source: v.source });
      }
    } catch (err) {
      console.error('rate source failed', err && err.message);
    }
  }
  res.setHeader('Cache-Control', 'no-store');
  return res.status(502).json({ error: 'Couldn’t get today’s exchange rate.' });
}

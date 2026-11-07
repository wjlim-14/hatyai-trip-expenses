// Nearby places from Google Places API (New) when GOOGLE_MAPS_API_KEY is set; otherwise the page falls back to OpenStreetMap.
const KEY = process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_PLACES_API_KEY || '';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!KEY) return res.status(200).json({ source: 'none', places: [] });
  const lat = Number(req.query.lat), lng = Number(req.query.lng);
  if (!isFinite(lat) || !isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return res.status(400).json({ error: 'Missing or invalid location.' });
  }
  const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : '';
  const url = q ? 'https://places.googleapis.com/v1/places:searchText' : 'https://places.googleapis.com/v1/places:searchNearby';
  const payload = q
    ? { textQuery: q, locationBias: { circle: { center: { latitude: lat, longitude: lng }, radius: 5000 } }, pageSize: 10, languageCode: 'en' }
    : { locationRestriction: { circle: { center: { latitude: lat, longitude: lng }, radius: 150 } }, maxResultCount: 20, rankPreference: 'DISTANCE', languageCode: 'en' };
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': KEY,
        'X-Goog-FieldMask': 'places.displayName,places.location,places.primaryTypeDisplayName,places.shortFormattedAddress'
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000)
    });
    const j = await r.json();
    if (!r.ok) {
      console.error('places error', r.status, j && j.error && j.error.message);
      return res.status(502).json({ source: 'google', error: 'Google Places didn’t answer: ' + ((j && j.error && j.error.status) || r.status) + '. Check the API key setup.' });
    }
    const places = (j.places || []).map((p) => ({
      name: String((p.displayName && p.displayName.text) || '').slice(0, 120),
      lat: p.location && p.location.latitude,
      lng: p.location && p.location.longitude,
      type: String((p.primaryTypeDisplayName && p.primaryTypeDisplayName.text) || '').slice(0, 40),
      address: String(p.shortFormattedAddress || '').slice(0, 160)
    })).filter((p) => p.name && isFinite(p.lat) && isFinite(p.lng));
    return res.status(200).json({ source: 'google', places });
  } catch (err) {
    console.error(err);
    return res.status(502).json({ source: 'google', error: 'Google Places didn’t respond. Try again.' });
  }
}

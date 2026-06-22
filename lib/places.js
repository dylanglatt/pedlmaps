import { GOOGLE_API_KEY } from './config';

// Places API (New). Note: like Google's other web services, these REST calls are
// native-only (no browser CORS) — autocomplete won't run in the web preview.
const BASE = 'https://places.googleapis.com/v1';

function ensureKey() {
  if (!GOOGLE_API_KEY || GOOGLE_API_KEY.startsWith('PASTE_')) {
    throw new Error('Add your Google Maps key in lib/config.js');
  }
}

// Type-ahead suggestions for free text, biased to NYC.
// Returns [{ placeId, primary, secondary }].
export async function autocomplete(input) {
  ensureKey();
  if (!input || input.trim().length < 3) return [];
  const res = await fetch(`${BASE}/places:autocomplete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': GOOGLE_API_KEY },
    body: JSON.stringify({
      input,
      includedRegionCodes: ['us'],
      locationBias: { circle: { center: { latitude: 40.75, longitude: -73.98 }, radius: 25000 } },
    }),
  });
  if (!res.ok) throw new Error(`autocomplete ${res.status}`);
  const json = await res.json();
  return (json.suggestions || [])
    .map((s) => {
      const p = s.placePrediction;
      if (!p) return null;
      return {
        placeId: p.placeId,
        primary: p.structuredFormat?.mainText?.text || p.text?.text || '',
        secondary: p.structuredFormat?.secondaryText?.text || '',
      };
    })
    .filter((x) => x && x.placeId);
}

// Resolve a chosen suggestion to coordinates. Returns { lat, lon, label }.
export async function placeDetails(placeId) {
  ensureKey();
  const res = await fetch(`${BASE}/places/${placeId}`, {
    headers: {
      'X-Goog-Api-Key': GOOGLE_API_KEY,
      'X-Goog-FieldMask': 'location,displayName,formattedAddress',
    },
  });
  if (!res.ok) throw new Error(`placeDetails ${res.status}`);
  const j = await res.json();
  return {
    lat: j.location.latitude,
    lon: j.location.longitude,
    label: j.formattedAddress || j.displayName?.text || '',
  };
}

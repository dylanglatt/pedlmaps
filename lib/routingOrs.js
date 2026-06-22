import { ORS_API_KEY } from './config';

// Generic profile ('walk'|'bike') -> ORS profile name.
const PROF = { walk: 'foot-walking', bike: 'cycling-regular' };
const BASE = 'https://api.openrouteservice.org';

function ensureKey() {
  if (!ORS_API_KEY || ORS_API_KEY.startsWith('PASTE_')) {
    throw new Error('Add your OpenRouteService key in lib/config.js');
  }
}

export async function geocode(text) {
  ensureKey();
  const params = new URLSearchParams({
    api_key: ORS_API_KEY,
    text,
    'boundary.country': 'US',
    'focus.point.lon': '-73.98',
    'focus.point.lat': '40.75',
    size: '1',
  });
  const res = await fetch(`${BASE}/geocode/search?${params}`);
  if (!res.ok) throw new Error(`geocode ${res.status}`);
  const json = await res.json();
  const f = json.features?.[0];
  if (!f) return null;
  const [lon, lat] = f.geometry.coordinates;
  return { lat, lon, label: f.properties?.label || text };
}

// locations: [[lon,lat],...]; sources/destinations: index arrays.
// Returns { durations:[[s]], distances:[[m]] }.
export async function matrix(profile, locations, sources, destinations) {
  ensureKey();
  const res = await fetch(`${BASE}/v2/matrix/${PROF[profile]}`, {
    method: 'POST',
    headers: { Authorization: ORS_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ locations, sources, destinations, metrics: ['duration', 'distance'] }),
  });
  if (!res.ok) throw new Error(`matrix ${res.status}`);
  return res.json();
}

// coordinates: ordered [[lon,lat],...].
// Returns { distance, duration, coords:[[lat,lon]], maneuvers:[{instruction,location:[lat,lon],distance}] }.
export async function directions(profile, coordinates) {
  ensureKey();
  const res = await fetch(`${BASE}/v2/directions/${PROF[profile]}/geojson`, {
    method: 'POST',
    headers: { Authorization: ORS_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ coordinates, instructions: true }),
  });
  if (!res.ok) throw new Error(`directions ${res.status}`);
  const json = await res.json();
  const feat = json.features?.[0];
  if (!feat) throw new Error('no route');
  const line = feat.geometry.coordinates;
  const coords = line.map(([lon, lat]) => [lat, lon]);
  const summary = feat.properties.summary || {};
  const maneuvers = [];
  for (const seg of feat.properties.segments || []) {
    for (const step of seg.steps || []) {
      const idx = step.way_points?.[0] ?? 0;
      const pt = line[idx] || line[0];
      maneuvers.push({ instruction: step.instruction, location: [pt[1], pt[0]], distance: step.distance });
    }
  }
  return { distance: summary.distance, duration: summary.duration, coords, maneuvers };
}

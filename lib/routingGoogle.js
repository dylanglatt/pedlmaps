import { GOOGLE_API_KEY } from './config';
import { phrase } from './navPhrasing';

// Generic profile ('walk'|'bike') -> Google travel mode.
const MODE = { walk: 'walking', bike: 'bicycling' };
const BASE = 'https://maps.googleapis.com/maps/api';

function ensureKey() {
  if (!GOOGLE_API_KEY || GOOGLE_API_KEY.startsWith('PASTE_')) {
    throw new Error('Add your Google Maps key in lib/config.js');
  }
}

// Strip Google's HTML instruction markup down to plain spoken text.
function cleanInstruction(html) {
  return (html || '')
    .replace(/<\/?[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

// Decode a Google encoded polyline into [[lat, lon], ...].
function decodePolyline(str) {
  let index = 0, lat = 0, lng = 0;
  const coords = [];
  while (index < str.length) {
    let b, shift = 0, result = 0;
    do { b = str.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lat += (result & 1) ? ~(result >> 1) : (result >> 1);
    shift = 0; result = 0;
    do { b = str.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lng += (result & 1) ? ~(result >> 1) : (result >> 1);
    coords.push([lat / 1e5, lng / 1e5]);
  }
  return coords;
}

export async function geocode(text) {
  ensureKey();
  const params = new URLSearchParams({
    address: text,
    key: GOOGLE_API_KEY,
    region: 'us',
    bounds: '40.45,-74.30|40.95,-73.65', // bias to NYC
  });
  const res = await fetch(`${BASE}/geocode/json?${params}`);
  if (!res.ok) throw new Error(`geocode ${res.status}`);
  const json = await res.json();
  if (json.status !== 'OK') {
    if (json.status === 'ZERO_RESULTS') return null;
    throw new Error(json.error_message || `geocode ${json.status}`);
  }
  const r = json.results[0];
  const loc = r.geometry.location;
  return { lat: loc.lat, lon: loc.lng, label: r.formatted_address || text };
}

const toLatLng = (locations, i) => `${locations[i][1]},${locations[i][0]}`; // [lon,lat] -> "lat,lng"

// locations: [[lon,lat],...]; sources/destinations: index arrays.
// Returns { durations:[[s]], distances:[[m]] } indexed [sourceIdx][destIdx].
export async function matrix(profile, locations, sources, destinations) {
  ensureKey();
  const params = new URLSearchParams({
    origins: sources.map((i) => toLatLng(locations, i)).join('|'),
    destinations: destinations.map((i) => toLatLng(locations, i)).join('|'),
    mode: MODE[profile],
    key: GOOGLE_API_KEY,
  });
  const res = await fetch(`${BASE}/distancematrix/json?${params}`);
  if (!res.ok) throw new Error(`matrix ${res.status}`);
  const json = await res.json();
  if (json.status !== 'OK') throw new Error(json.error_message || `matrix ${json.status}`);
  const durations = [];
  const distances = [];
  json.rows.forEach((row) => {
    const dRow = [];
    const mRow = [];
    row.elements.forEach((el) => {
      const ok = el.status === 'OK';
      dRow.push(ok ? el.duration.value : null);
      mRow.push(ok ? el.distance.value : null);
    });
    durations.push(dRow);
    distances.push(mRow);
  });
  return { durations, distances };
}

// coordinates: ordered [[lon,lat],...] (origin, [waypoints...], destination).
// Returns { distance, duration, coords:[[lat,lon]], maneuvers:[{instruction,location:[lat,lon],distance}] }.
export async function directions(profile, coordinates) {
  ensureKey();
  const origin = `${coordinates[0][1]},${coordinates[0][0]}`;
  const last = coordinates[coordinates.length - 1];
  const destination = `${last[1]},${last[0]}`;
  const params = new URLSearchParams({ origin, destination, mode: MODE[profile], key: GOOGLE_API_KEY });
  if (coordinates.length > 2) {
    const via = coordinates.slice(1, -1).map((c) => `${c[1]},${c[0]}`).join('|');
    params.set('waypoints', via);
  }
  const res = await fetch(`${BASE}/directions/json?${params}`);
  if (!res.ok) throw new Error(`directions ${res.status}`);
  const json = await res.json();
  if (json.status !== 'OK') throw new Error(json.error_message || `directions ${json.status}`);
  const route = json.routes[0];
  if (!route) throw new Error('no route');
  let distance = 0, duration = 0;
  const maneuvers = [];
  for (const leg of route.legs || []) {
    distance += leg.distance?.value || 0;
    duration += leg.duration?.value || 0;
    for (const step of leg.steps || []) {
      maneuvers.push({
        instruction: phrase(cleanInstruction(step.html_instructions)),
        location: [step.start_location.lat, step.start_location.lng],
        distance: step.distance?.value || 0,
        maneuver: step.maneuver || null,
      });
    }
  }
  const coords = decodePolyline(route.overview_polyline?.points || '');
  return { distance, duration, coords, maneuvers };
}

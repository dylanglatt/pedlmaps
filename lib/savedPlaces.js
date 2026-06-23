import AsyncStorage from '@react-native-async-storage/async-storage';
import { nearest } from './gbfs';

// Saved places. A place is a *location* (not a station): home, work, or any
// custom spot you nickname. Its nearby docks are derived live from GBFS each
// time — never persisted, since bikes/docks move constantly.
//
// SavedPlace shape:
//   {
//     id:       string,                       // stable local id
//     nickname: string,                       // "Home", "Gym", "Mom's"
//     type:     'home' | 'work' | 'custom',
//     lat: number, lon: number,
//     address?: string,
//     flipMode: 'bike' | 'dock' | null,       // remembered flip; null = default
//   }
//
// `flipMode` is the heart of the card interaction: tapping the badge flips a
// place between "bikes to take" and "docks to return", and we remember it.
const KEY = 'dockhop.places.v1';
const OLD_KEY = 'citibike.saved.v1'; // legacy { homeId, workId }

let _seq = 0;
function makeId() {
  return `p_${Date.now().toString(36)}_${(_seq++).toString(36)}`;
}

// ---- Pure helpers (no I/O — safe to call every render) --------------------

// The mode a place should show when nothing has been flipped. Inferred from
// the place type and time of day: in the morning you take a bike *from* home
// and need a *dock* at work; after ~3pm it reverses. Custom places are
// destinations, so they default to docks-to-return.
export function defaultMode(place, now = new Date()) {
  const evening = now.getHours() >= 15;
  if (place.type === 'home') return evening ? 'dock' : 'bike';
  if (place.type === 'work') return evening ? 'bike' : 'dock';
  return 'dock';
}

// The mode actually in effect: an explicit flip wins, else the inferred default.
export function effectiveMode(place, now = new Date()) {
  return place.flipMode === 'bike' || place.flipMode === 'dock'
    ? place.flipMode
    : defaultMode(place, now);
}

// The opposite of whatever's currently showing — what a tap on the badge sets.
export function flippedMode(place, now = new Date()) {
  return effectiveMode(place, now) === 'bike' ? 'dock' : 'bike';
}

// The N nearest stations to a place, with `distance` added (live, unsorted-safe).
export function nearestDocks(place, stations, limit = 3) {
  if (!place || !stations?.length) return [];
  return nearest(stations, place.lat, place.lon, limit);
}

// Normalize an arbitrary saved-location object (e.g. a Google place result) into
// a SavedPlace. Accepts lat/lon or lat/lng; tolerates partials.
export function makePlace({ nickname, type = 'custom', lat, lon, lng, address, name }) {
  return {
    id: makeId(),
    nickname: (nickname || '').trim() || (type === 'home' ? 'Home' : type === 'work' ? 'Work' : 'Saved place'),
    name: (name || '').trim(), // the real place name (e.g. "Grand Central"), distinct from the nickname
    type,
    lat: lat,
    lon: lon != null ? lon : lng,
    address: address || '',
    flipMode: null,
  };
}

// Display label for a saved place: "Grand Central (Work)" when the place has a
// real name distinct from its nickname, else just the nickname/name. Falls back
// to the first line of the address for older saves with no stored name.
export function placeLabel(p) {
  if (!p) return '';
  const nick = (p.nickname || '').trim();
  const base = (p.name || '').trim() || (p.address ? p.address.split(',')[0].trim() : '');
  if (nick && base && nick.toLowerCase() !== base.toLowerCase()) return `${base} (${nick})`;
  return nick || base || '';
}

// Favorites ordered Apple-Maps style: Home, Work, then everything else.
export function sortedFavorites(places) {
  const rank = (p) => (p.type === 'home' ? 0 : p.type === 'work' ? 1 : 2);
  return [...(places || [])].sort((a, b) => rank(a) - rank(b));
}

export const findByType = (places, type) => (places || []).find((p) => p.type === type) || null;

// ---- Persistence ----------------------------------------------------------

export async function loadPlaces() {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}

export async function savePlaces(places) {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(places));
  } catch {
    // ignore write errors (private mode, quota, etc.)
  }
  return places;
}

// Add a place; de-dupes Home/Work so there's only ever one of each.
export async function addPlace(place) {
  const cur = await loadPlaces();
  const deduped =
    place.type === 'custom' ? cur : cur.filter((p) => p.type !== place.type);
  const next = [...deduped, place];
  return savePlaces(next);
}

export async function updatePlace(id, patch) {
  const cur = await loadPlaces();
  const next = cur.map((p) => (p.id === id ? { ...p, ...patch } : p));
  return savePlaces(next);
}

export async function removePlace(id) {
  const cur = await loadPlaces();
  return savePlaces(cur.filter((p) => p.id !== id));
}

// Persist a flip and return the updated list. Pass the resolved mode (not null).
export async function setFlipMode(id, mode) {
  return updatePlace(id, { flipMode: mode === 'bike' || mode === 'dock' ? mode : null });
}

// One-time migration from the legacy { homeId, workId } station-id model.
// Needs the live stations array to resolve coordinates. Best-effort: returns the
// migrated list if it ran, or null if there was nothing to migrate.
export async function migrateLegacy(stations) {
  try {
    const existing = await AsyncStorage.getItem(KEY);
    if (existing) return null; // already on the new model
    const oldRaw = await AsyncStorage.getItem(OLD_KEY);
    if (!oldRaw) return null;
    const old = JSON.parse(oldRaw);
    const byId = {};
    for (const s of stations || []) byId[s.id] = s;
    const out = [];
    if (old.homeId && byId[old.homeId]) {
      out.push(makePlace({ nickname: 'Home', type: 'home', lat: byId[old.homeId].lat, lon: byId[old.homeId].lon }));
    }
    if (old.workId && byId[old.workId]) {
      out.push(makePlace({ nickname: 'Work', type: 'work', lat: byId[old.workId].lat, lon: byId[old.workId].lon }));
    }
    if (!out.length) return null;
    await savePlaces(out);
    return out;
  } catch {
    return null;
  }
}

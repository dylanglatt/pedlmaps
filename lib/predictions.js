import data from './availability.json';

// Typical-availability patterns from historical Citi Bike trip data (see
// scripts/agg_availability.py + finalize_availability.py). Schema 2: per station,
// fe[day][hour] (electric) and fc[day][hour] (classic/manual) are 0-100 and STACK
// to total bike fullness. day is JS getDay() (0=Sun..6=Sat). Join via short_name.
const STATIONS = data.stations || {};
export const AVAILABILITY_META = data.meta || {};
export const DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const LOW_CONFIDENCE_SAMPLES = 500;
const clamp = (v) => Math.max(0, Math.min(100, v));

export function hasPattern(shortName) {
  return !!(shortName && STATIONS[shortName]);
}

export function stationSamples(shortName) {
  const st = STATIONS[shortName];
  return st ? st.samples || 0 : 0;
}

export function isLowConfidence(shortName) {
  return stationSamples(shortName) < LOW_CONFIDENCE_SAMPLES;
}

// Electric + classic fullness arrays (each 24, 0-100, stacking) for a weekday.
export function splitPattern(shortName, jsDay) {
  const st = STATIONS[shortName];
  if (!st || !st.fe || !st.fc) return null;
  const e = st.fe[jsDay] || st.fe[0];
  const c = st.fc[jsDay] || st.fc[0];
  if (!e || !c) return null;
  return { e: e.slice(), c: c.slice() };
}

// Typical open-dock fullness (24, 0-100): the inverse of total bike fullness.
export function docksPattern(shortName, jsDay) {
  const s = splitPattern(shortName, jsDay);
  if (!s) return null;
  return s.e.map((_, h) => clamp(100 - (s.e[h] + s.c[h])));
}

// Natural-language caption for a given hour + mode, from a 0-100 fullness value.
export function patternCaption(value, mode = 'bike') {
  const v = value == null ? 0 : value;
  if (mode === 'dock') {
    if (v >= 70) return 'usually plenty of open docks';
    if (v >= 45) return 'usually some open docks';
    if (v >= 25) return 'often filling up';
    return 'usually full';
  }
  if (v >= 70) return 'usually plenty of bikes';
  if (v >= 45) return 'usually a good number of bikes';
  if (v >= 25) return 'often running low on bikes';
  return 'usually out of bikes';
}

import data from './availability.json';

// Typical-availability patterns derived from historical Citi Bike trip data
// (see scripts/agg_availability.py + finalize_availability.py). Each station has
// f[day][hour] = bikes-fullness 0-100, where day is JS getDay() (0=Sun..6=Sat).
// We join to a live GBFS station by its short_name.
const STATIONS = data.stations || {};
export const AVAILABILITY_META = data.meta || {};

const LOW_CONFIDENCE_SAMPLES = 500; // < this over the source period → thin data

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

// 24 hourly fullness values (0-100) for a station + weekday, oriented to the
// active mode. 'dock' inverts bikes-fullness (more bikes ≈ fewer open docks).
export function fullnessPattern(shortName, jsDay, mode = 'bike') {
  const st = STATIONS[shortName];
  if (!st || !st.f) return null;
  const row = st.f[jsDay] != null ? st.f[jsDay] : st.f[0];
  if (!row) return null;
  return mode === 'dock' ? row.map((v) => 100 - v) : row.slice();
}

// Map a 0-100 fullness to an availability level reusing the app's good/low/none.
export function fullnessLevel(v) {
  if (v >= 55) return 'good';
  if (v >= 25) return 'low';
  return 'none';
}

// Plain-language caption for a given hour, matching Google "popular times" tone.
export function patternCaption(pattern, hour, mode = 'bike') {
  if (!pattern) return '';
  const v = pattern[Math.max(0, Math.min(23, hour))];
  const noun = mode === 'dock' ? 'open docks' : 'bikes';
  if (v >= 70) return `usually plenty of ${noun}`;
  if (v >= 45) return `usually some ${noun}`;
  if (v >= 25) return `often low on ${noun}`;
  return `usually empty of ${noun}`;
}

export const DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

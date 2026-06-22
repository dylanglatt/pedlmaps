import { distanceMeters } from './geo';

// Citi Bike GBFS feeds (public, no API key, CORS-enabled).
// Discovery doc: https://gbfs.citibikenyc.com/gbfs/gbfs.json
const INFO_URL = 'https://gbfs.lyft.com/gbfs/1.1/bkn/en/station_information.json';
const STATUS_URL = 'https://gbfs.lyft.com/gbfs/1.1/bkn/en/station_status.json';

// Static station info changes rarely — cache it for the session.
let _infoCache = null;

async function fetchInfo() {
  if (_infoCache) return _infoCache;
  const res = await fetch(INFO_URL);
  if (!res.ok) throw new Error(`station_information ${res.status}`);
  const json = await res.json();
  const map = {};
  for (const s of json.data.stations) {
    map[s.station_id] = {
      id: s.station_id,
      name: s.name,
      lat: s.lat,
      lon: s.lon,
      capacity: s.capacity,
    };
  }
  _infoCache = map;
  return map;
}

async function fetchStatus() {
  const res = await fetch(STATUS_URL);
  if (!res.ok) throw new Error(`station_status ${res.status}`);
  const json = await res.json();
  return json.data.stations;
}

// Returns a merged array of station objects with derived, rider-friendly fields.
// Note: num_bikes_available already excludes disabled bikes; num_ebikes_available
// is a subset of it, so classic = bikes - ebikes.
export async function fetchStations() {
  const [info, status] = await Promise.all([fetchInfo(), fetchStatus()]);
  const out = [];
  for (const st of status) {
    const meta = info[st.station_id];
    if (!meta) continue; // status without matching info
    const bikes = st.num_bikes_available ?? 0;
    const ebikes = st.num_ebikes_available ?? 0;
    out.push({
      id: st.station_id,
      name: meta.name,
      lat: meta.lat,
      lon: meta.lon,
      capacity: meta.capacity,
      bikes,
      ebikes,
      classic: Math.max(0, bikes - ebikes),
      docks: st.num_docks_available ?? 0,
      disabledBikes: st.num_bikes_disabled ?? 0,
      isRenting: st.is_renting === 1,
      isReturning: st.is_returning === 1,
      isInstalled: st.is_installed === 1,
      lastReported: st.last_reported,
    });
  }
  return out;
}

// Add distance from a point and return the nearest `limit` stations, sorted.
export function nearest(stations, lat, lon, limit = 75) {
  return stations
    .map((s) => ({ ...s, distance: distanceMeters(lat, lon, s.lat, s.lon) }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, limit);
}

// The count that matters for the current mode + bike-type filter.
// bikeType: 'both' | 'classic' | 'electric'
export function countFor(station, mode, bikeType = 'both') {
  if (mode === 'dock') return station.docks;
  if (bikeType === 'electric') return station.ebikes;
  if (bikeType === 'classic') return station.classic;
  return station.bikes;
}

// Is the station usable at all for the current intent?
export function isUsable(station, mode) {
  if (!station.isInstalled) return false;
  return mode === 'dock' ? station.isReturning : station.isRenting;
}

// Availability level: 'good' | 'low' | 'none' | 'off'.
export function availabilityLevel(station, mode, bikeType = 'both') {
  if (!isUsable(station, mode)) return 'off';
  const n = countFor(station, mode, bikeType);
  if (n >= 3) return 'good';
  if (n >= 1) return 'low';
  return 'none';
}


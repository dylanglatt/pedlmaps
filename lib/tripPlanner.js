import { distanceMeters } from './geo';
import { matrix, WALK, BIKE } from './routing';
import { TRIP, SPEED } from './config';

// How many bikes of the wanted type are available?
function availableOfType(station, prefer) {
  if (prefer === 'ebike') return station.ebikes;
  if (prefer === 'classic') return station.classic;
  return station.bikes;
}

// Pick nearest usable stations at each end (straight-line pre-filter to keep matrix small).
function originCandidates(stations, origin, prefer) {
  return stations
    .filter((s) => s.isRenting && availableOfType(s, prefer) > 0)
    .map((s) => ({ ...s, straight: distanceMeters(origin.lat, origin.lon, s.lat, s.lon) }))
    .filter((s) => s.straight <= TRIP.maxStationWalkM)
    .sort((a, b) => a.straight - b.straight)
    .slice(0, TRIP.candidateStations);
}

function destCandidates(stations, dest) {
  return stations
    .filter((s) => s.isReturning && s.docks >= TRIP.minDocksAtDest)
    .map((s) => ({ ...s, straight: distanceMeters(dest.lat, dest.lon, s.lat, s.lon) }))
    .filter((s) => s.straight <= TRIP.maxStationWalkM)
    .sort((a, b) => a.straight - b.straight)
    .slice(0, TRIP.candidateStations);
}

const lonlat = (p) => [p.lon, p.lat];

// Plan a trip. Returns { best, alternates } where each plan has the chosen
// stations, per-leg seconds, and total seconds. prefer: 'any' | 'ebike' | 'classic'.
export async function planTrip({ origin, dest, stations, prefer = 'any' }) {
  const origins = originCandidates(stations, origin, prefer);
  const dests = destCandidates(stations, dest);
  if (!origins.length) throw new Error('No nearby station has an available bike of that type.');
  if (!dests.length) throw new Error('No nearby station at the destination has an open dock.');

  // 1) walk: you -> each origin station
  const walkOut = await matrix(
    WALK,
    [lonlat(origin), ...origins.map(lonlat)],
    [0],
    origins.map((_, i) => i + 1)
  );
  // 2) walk: each dest station -> destination
  const walkIn = await matrix(
    WALK,
    [lonlat(dest), ...dests.map(lonlat)],
    dests.map((_, i) => i + 1),
    [0]
  );
  // 3) bike: each origin station -> each dest station
  const bike = await matrix(
    BIKE,
    [...origins.map(lonlat), ...dests.map(lonlat)],
    origins.map((_, i) => i),
    dests.map((_, i) => origins.length + i)
  );

  // For "any", assume you'll grab whatever's faster at the origin station — an
  // e-bike if one's available, otherwise a classic. classic/ebike are fixed.
  const typeFor = (st) =>
    prefer === 'classic' ? 'classic' : prefer === 'ebike' ? 'ebike' : st.ebikes > 0 ? 'ebike' : 'classic';

  const plans = [];
  for (let i = 0; i < origins.length; i++) {
    const walkToBike = walkOut.durations?.[0]?.[i];
    if (walkToBike == null) continue;
    const bikeType = typeFor(origins[i]);
    const speed = SPEED[bikeType] ?? 1.0;
    for (let j = 0; j < dests.length; j++) {
      const rawRide = bike.durations?.[i]?.[j];
      const walkToDest = walkIn.durations?.[j]?.[0];
      if (rawRide == null || walkToDest == null) continue;
      const ride = rawRide * speed;
      plans.push({
        originStation: origins[i],
        destStation: dests[j],
        bikeType,
        walkToBikeSec: walkToBike,
        rideSec: ride,
        walkToDestSec: walkToDest,
        totalSec: walkToBike + ride + walkToDest,
      });
    }
  }
  if (!plans.length) throw new Error('Could not compute a route. Check your ORS key / network.');
  plans.sort((a, b) => a.totalSec - b.totalSec);
  return { best: plans[0], alternates: plans.slice(1, 3) };
}

export const fmtMin = (sec) => `${Math.max(1, Math.round(sec / 60))} min`;

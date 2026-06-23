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

// How much "virtual detour" (seconds) we'll accept to avoid a thin station. A
// healthy buffer (>=3 bikes or open docks) is free; 2 is a mild risk; 1 is a
// real gamble that it'll be gone/full by the time you arrive. This nudges the
// planner toward robust stations without sending you far out of your way: a
// station only loses to a buffered one if it's also faster by more than the gap.
function riskPenalty(buffer) {
  if (buffer >= 3) return 0;
  if (buffer === 2) return 45;
  if (buffer === 1) return 120;
  return 600; // shouldn't happen (candidates are pre-filtered), but guard
}

// Plan a trip. Returns { best }: the single recommended route, ranked by total
// time plus a small reliability penalty so it avoids near-empty stations and
// nearly-full docks. prefer: 'any' | 'ebike' | 'classic'. Each plan carries the
// chosen stations, per-leg seconds, and total seconds.
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
      const distanceM =
        (walkOut.distances?.[0]?.[i] || 0) +
        (bike.distances?.[i]?.[j] || 0) +
        (walkIn.distances?.[j]?.[0] || 0);
      plans.push({
        originStation: origins[i],
        destStation: dests[j],
        bikeType,
        walkToBikeSec: walkToBike,
        rideSec: ride,
        walkToDestSec: walkToDest,
        totalSec: walkToBike + ride + walkToDest,
        distanceM,
      });
    }
  }
  if (!plans.length) throw new Error('Could not compute a route. Check your ORS key / network.');
  // Rank by time + a reliability nudge; the displayed totalSec stays untouched.
  const score = (p) =>
    p.totalSec + riskPenalty(availableOfType(p.originStation, prefer)) + riskPenalty(p.destStation.docks);
  plans.sort((a, b) => score(a) - score(b));
  return { best: plans[0] };
}

// Plan a sequence of points (origin, ...stops, destination) as chained single
// trips: ride to a dock near each next point, walk in, walk back out, ride on.
// Each leg uses planTrip's reliability-aware best. Returns
// { segments:[plan], totalSec, distanceM }. `dwellSec` is time spent at each
// intermediate stop (added to the ETA). Throws if any leg can't be planned.
export async function planMultiTrip({ points, stations, prefer = 'any', dwellSec = 0 }) {
  if (!points || points.length < 2) throw new Error('Need an origin and destination.');
  const segments = [];
  for (let i = 0; i < points.length - 1; i++) {
    const { best } = await planTrip({ origin: points[i], dest: points[i + 1], stations, prefer });
    segments.push(best);
  }
  const travel = segments.reduce((s, g) => s + g.totalSec, 0);
  const stops = Math.max(0, points.length - 2);
  return {
    segments,
    totalSec: travel + dwellSec * stops,
    distanceM: segments.reduce((s, g) => s + (g.distanceM || 0), 0),
  };
}

export const fmtMin = (sec) => `${Math.max(1, Math.round(sec / 60))} min`;
export const fmtMiles = (m) => `${(m / 1609.34).toFixed(1)} mi`;

import { distanceMeters } from './geo';
import { matrix, WALK, BIKE } from './routing';
import { TRIP, SPEED } from './config';

// How many bikes of the wanted type are available?
function availableOfType(station, prefer) {
  if (prefer === 'ebike') return station.ebikes;
  if (prefer === 'classic') return station.classic;
  return station.bikes;
}

// Pick nearest usable stations at each end (straight-line pre-filter to keep the
// matrix small). `requireAvailable` gates on live counts for "now"; predicted
// planning passes false so usually-empty stations stay in the pool (we both skip
// them AND reference the closest one in the "go here instead" message).
function originCandidates(stations, origin, prefer, { count, maxWalkM, requireAvailable }) {
  return stations
    .filter((s) => s.isRenting && (!requireAvailable || availableOfType(s, prefer) > 0))
    .map((s) => ({ ...s, straight: distanceMeters(origin.lat, origin.lon, s.lat, s.lon) }))
    .filter((s) => s.straight <= maxWalkM)
    .sort((a, b) => a.straight - b.straight)
    .slice(0, count);
}

function destCandidates(stations, dest, { count, maxWalkM, requireDocks }) {
  return stations
    .filter((s) => s.isReturning && (!requireDocks || s.docks >= requireDocks))
    .map((s) => ({ ...s, straight: distanceMeters(dest.lat, dest.lon, s.lat, s.lon) }))
    .filter((s) => s.straight <= maxWalkM)
    .sort((a, b) => a.straight - b.straight)
    .slice(0, count);
}

// For a predicted trip, choose a station that TYPICALLY has the wanted bike +
// open docks. Three tiers, by how far the nearest reliable station is from your
// closest station:
//   'swap'   — within walkBudgetSec (~5 min): pick it silently (UI shows a callout)
//   'choice' — within walkCapSec (~12 min): recommend it but surface the trade
//              (the extra time, plus "take a classic here") so the user can decide
//   'scarce' — nothing reliable in range: honest fallback (fastest least-bad)
// `classicHere` flags when classic is typically available at the closest station,
// so the UI can offer it as the no-detour alternative.
function choosePredicted(plans, prefer, walkBudgetSec) {
  const closest = plans.reduce((a, b) => (b.walkToBikeSec < a.walkToBikeSec ? b : a));
  // "Reliable" = typically stocked for the wanted bike type AND typically has an
  // open dock. Uses predicted FULLNESS (same signal as the captions) so we never
  // recommend a station the caption calls "usually empty"; stations with no
  // historical pattern fall back to live counts.
  const fullnessOf = (st, type) =>
    st.predFe == null ? null : type === 'ebike' ? st.predFe : type === 'classic' ? st.predFc : st.predFe + st.predFc;
  const reliable = (p) => {
    const typeFull = fullnessOf(p.originStation, prefer);
    const bikeOk = typeFull == null
      ? availableOfType(p.originStation, prefer) >= TRIP.reliableBikes
      : typeFull >= TRIP.reliableFullness;
    const dockOk = p.destStation.predDockFull == null
      ? p.destStation.docks >= TRIP.reliableDocks
      : p.destStation.predDockFull >= TRIP.reliableDockFullness;
    return bikeOk && dockOk;
  };
  const within = (p, budget) => p.walkToBikeSec <= closest.walkToBikeSec + budget;
  const reliablePlans = plans.filter(reliable).sort((a, b) => a.totalSec - b.totalSec);

  // Is a classic typically available at the closest station? (the no-detour out)
  const cf = fullnessOf(closest.originStation, 'classic');
  const classicHere = prefer !== 'classic'
    && (cf == null ? closest.originStation.classic >= TRIP.reliableBikes : cf >= TRIP.reliableFullness)
    ? { name: closest.originStation.name } : null;

  const base = {
    closest: closest.originStation,
    closestWalkSec: closest.walkToBikeSec,
    closestTotalSec: closest.totalSec,
    classicHere,
  };

  const inBudget = reliablePlans.filter((p) => within(p, walkBudgetSec));
  if (inBudget.length) {
    const best = inBudget[0];
    return { ...base, best, tier: 'swap', swapped: best.originStation.id !== closest.originStation.id };
  }
  const reach = reliablePlans.find((p) => within(p, TRIP.walkCapSec));
  if (reach) {
    return { ...base, best: reach, tier: 'choice', swapped: reach.originStation.id !== closest.originStation.id };
  }
  return { ...base, best: [...plans].sort((a, b) => a.totalSec - b.totalSec)[0], tier: 'scarce', scarce: true, swapped: false };
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

// Plan a trip. For "now" (predicted=false): returns { best }, ranked by time +
// a reliability nudge. For predicted depart/arrive: searches wider and returns
// { best, scarce, swapped, closest, closestWalkSec } so the UI can say "your
// closest station is usually empty — go here instead." prefer: 'any'|'ebike'|'classic'.
export async function planTrip({ origin, dest, stations, prefer = 'any', predicted = false, walkBudgetSec = TRIP.walkBudgetSec }) {
  const oOpts = predicted
    ? { count: TRIP.predictedCandidateStations, maxWalkM: TRIP.predictedMaxStationWalkM, requireAvailable: false }
    : { count: TRIP.candidateStations, maxWalkM: TRIP.maxStationWalkM, requireAvailable: true };
  const dOpts = predicted
    ? { count: TRIP.predictedCandidateStations, maxWalkM: TRIP.predictedMaxStationWalkM, requireDocks: 0 }
    : { count: TRIP.candidateStations, maxWalkM: TRIP.maxStationWalkM, requireDocks: TRIP.minDocksAtDest };
  const origins = originCandidates(stations, origin, prefer, oOpts);
  const dests = destCandidates(stations, dest, dOpts);
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
  if (!plans.length) throw new Error("Couldn't find a route right now. Check your connection and try again.");
  if (predicted) return choosePredicted(plans, prefer, walkBudgetSec);
  // Live: rank by time + a reliability nudge; the displayed totalSec stays untouched.
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
export async function planMultiTrip({ points, stations, prefer = 'any', dwellSec = 0, predicted = false }) {
  if (!points || points.length < 2) throw new Error('Need an origin and destination.');
  const segments = [];
  for (let i = 0; i < points.length - 1; i++) {
    const { best } = await planTrip({ origin: points[i], dest: points[i + 1], stations, prefer, predicted });
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

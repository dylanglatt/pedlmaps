import { distanceMeters } from './geo';
import { destCandidates, riskPenalty } from './tripPlanner';
import { NAV, TRIP } from './config';

// Mid-ride dock reroute: the pure decision + scoring logic. No React Native here —
// voiceNav feeds it live GBFS data and acts on what it returns, so the whole
// policy can be replayed under plain Node.
//
// Calm by design: one heads-up per station, switch only when the dock is full (or
// nearly full and we're close), never flip back to a station we abandoned, and cap
// the number of switches per trip.

const WALK_MPS = 80 / 60; // same ~80 m/min walking pace as geo.walkMinutes

export function createDockWatch() {
  return {
    lastPollAt: 0,          // last poll attempt (success or failure) — the throttle
    inFlight: false,        // a status fetch is running
    watching: false,        // last poll saw us on a bike leg
    rideStartAt: 0,         // when the current bike leg started (drives the debug fake)
    switches: 0,            // dock switches made this trip
    abandoned: new Set(),   // station ids we've switched away from — never go back
    warned: new Set(),      // station ids we've already given the "down to N" heads-up
    keptSaid: new Set(),    // station ids we've already said "keeping your route" for
    fakeId: null,           // debug: the station the fake is pinned to (fires once per trip)
  };
}

// Straight-line time estimate (seconds), grid-adjusted. Used only to RANK
// candidates and size the "extra minutes" — the real path comes from directions().
function rideSec(from, st, cfg) { return (distanceMeters(from.lat, from.lon, st.lat, st.lon) * cfg.dockGridFactor) / cfg.fallbackSpeedMps; }
function walkSec(st, to, cfg) { return (distanceMeters(st.lat, st.lon, to.lat, to.lon) * cfg.dockGridFactor) / WALK_MPS; }

function plural(n, word) { return `${n} ${word}${n === 1 ? '' : 's'}`; }

function extraPhrase(sec) {
  const min = Math.round(sec / 60);
  return min < 1 ? 'about the same time' : `about ${plural(min, 'extra minute')}`;
}

// Pick the best alternative dock near the walk target, or null.
export function pickAlternative(state, { here, dock, target, stations }, cfg = { ...NAV, ...TRIP }) {
  const curSec = rideSec(here, dock, cfg) + walkSec(dock, target, cfg);
  const pool = destCandidates(stations, target, { count: Infinity, maxWalkM: cfg.maxStationWalkM, requireDocks: cfg.dockOkMin })
    .filter((s) => s.id !== dock.id && !state.abandoned.has(s.id));
  let best = null;
  for (const s of pool) {
    const sec = rideSec(here, s, cfg) + walkSec(s, target, cfg);
    const extraSec = sec - curSec;
    if (extraSec > cfg.dockMaxExtraSec) continue;
    const score = sec + riskPenalty(s.docks);
    if (!best || score < best.score) best = { station: s, extraSec, score };
  }
  return best;
}

// One decision from a fresh status snapshot. Records warn / keep-route lines so
// they're spoken once; a 'switch' is only recorded via recordSwitch() once the new
// route is actually in place.
//   { action: 'none' | 'warn' | 'keep' | 'switch', text?, from?, to?, extraSec?, reason }
export function decideDock(state, { here, dock, target, stations }, cfg = { ...NAV, ...TRIP }) {
  const live = stations.find((s) => s.id === dock.id);
  if (!live) return { action: 'none', reason: 'not-in-feed' }; // don't act on a feed glitch
  const docks = live.isReturning ? live.docks : 0;
  const name = live.name || dock.name || 'Your dock';
  const distM = distanceMeters(here.lat, here.lon, live.lat, live.lon);

  if (docks >= cfg.dockOkMin) return { action: 'none', reason: 'ok', docks };

  const trigger = docks === 0 || (docks <= 1 && distM <= cfg.dockCommitM);
  if (!trigger) {
    if (state.warned.has(live.id)) return { action: 'none', reason: 'already-warned', docks };
    state.warned.add(live.id);
    return { action: 'warn', reason: 'low', docks, text: `Heads up, ${name} is down to ${plural(docks, 'dock')}.` };
  }

  const status = docks === 0 ? 'is full' : 'is almost full';
  const keep = (reason, text) => {
    if (state.keptSaid.has(live.id)) return { action: 'none', reason, docks };
    state.keptSaid.add(live.id);
    return { action: 'keep', reason, docks, text };
  };
  if (state.switches >= cfg.dockMaxSwitches) return keep('max-switches', `${name} ${status}. Keeping your route.`);

  const alt = pickAlternative(state, { here, dock: live, target, stations }, cfg);
  if (!alt) return keep('no-alternative', `${name} ${status} and there's no better dock nearby. Keeping your route.`);

  return {
    action: 'switch',
    reason: docks === 0 ? 'full' : 'near-and-low',
    docks,
    from: live,
    to: alt.station,
    extraSec: Math.max(0, Math.round(alt.extraSec)),
    text: `${name} ${status}. Switching to ${alt.station.name}, ${extraPhrase(alt.extraSec)}.`,
  };
}

export function recordSwitch(state, sw) {
  state.abandoned.add(sw.from.id);
  state.switches += 1;
}

// Debug: pretend the watched dock drains to 0 about fakeFullAfterMs into the bike
// leg. Pinned to the first dock it fires on, so the replacement stays real.
function applyFake(state, stations, dock, now, cfg) {
  if (!cfg.debugFakeFullDock) return stations;
  if (!state.fakeId && now - state.rideStartAt >= cfg.fakeFullAfterMs) state.fakeId = dock.id;
  if (state.fakeId !== dock.id) return stations;
  return stations.map((s) => (s.id === dock.id ? { ...s, docks: 0 } : s));
}

// The per-fix entry point. Cheap and synchronous until the throttle allows a poll;
// then one status fetch. A failed fetch is a silent skip — guidance never waits on
// this. `dock` is null when we're not on a bike leg.
//   input: { now, here, dock, target, lastRerouteAt, fetchStations }
export async function pollDock(state, { now, here, dock, target, lastRerouteAt = 0, fetchStations }, cfg = { ...NAV, ...TRIP }) {
  if (!dock) { state.watching = false; return { action: 'none', reason: 'not-riding' }; }
  if (!state.watching) { state.watching = true; state.rideStartAt = now; }
  if (state.inFlight) return { action: 'none', reason: 'in-flight' };
  if (now - state.lastPollAt < cfg.dockWatchMs) return { action: 'none', reason: 'throttled' };
  if (now - lastRerouteAt < cfg.rerouteCooldownMs) return { action: 'none', reason: 'cooldown' };
  state.lastPollAt = now;
  state.inFlight = true;
  let stations;
  try { stations = await fetchStations(); } catch { return { action: 'none', reason: 'fetch-failed' }; }
  finally { state.inFlight = false; }
  if (!Array.isArray(stations)) return { action: 'none', reason: 'fetch-failed' };
  return decideDock(state, { here, dock, target: target || dock, stations: applyFake(state, stations, dock, now, cfg) }, cfg);
}

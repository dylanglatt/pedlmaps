// DEV-ONLY ride simulator. Feeds synthetic GPS fixes straight into the nav
// controller so voice guidance, waypoint arrival, the cross-street phrasing, and
// the off-route reroute can all be exercised on the iOS simulator with no real
// movement. Pure JS, no native deps. Only ever invoked behind __DEV__ UI.
//
// Set the Simulator's location to "None" (Features → Location → None) so the real
// watch stays silent and only our synthetic feed drives the ride.
import { nav } from './voiceNav';

const R = 6371000; // earth radius (m)
const toRad = (d) => (d * Math.PI) / 180;
const toDeg = (r) => (r * 180) / Math.PI;

function meters(a, b) {
  const f1 = toRad(a[0]), f2 = toRad(b[0]);
  const df = toRad(b[0] - a[0]), dl = toRad(b[1] - a[1]);
  const h = Math.sin(df / 2) ** 2 + Math.cos(f1) * Math.cos(f2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function bearing(a, b) {
  const f1 = toRad(a[0]), f2 = toRad(b[0]);
  const dl = toRad(b[1] - a[1]);
  const y = Math.sin(dl) * Math.cos(f2);
  const x = Math.cos(f1) * Math.sin(f2) - Math.sin(f1) * Math.cos(f2) * Math.cos(dl);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

// Move `dist` m from point p along compass bearing `brng`. Returns [lat, lon].
function project(p, brng, dist) {
  const d = dist / R, t = toRad(brng), f1 = toRad(p[0]), l1 = toRad(p[1]);
  const f2 = Math.asin(Math.sin(f1) * Math.cos(d) + Math.cos(f1) * Math.sin(d) * Math.cos(t));
  const l2 = l1 + Math.atan2(Math.sin(t) * Math.sin(d) * Math.cos(f1), Math.cos(d) - Math.sin(f1) * Math.sin(f2));
  return [toDeg(f2), ((toDeg(l2) + 540) % 360) - 180];
}

// Resample a polyline to ~stepM spacing so distance-threshold cues fire reliably
// (a sparse overview polyline can otherwise jump straight past a turn).
function densify(coords, stepM) {
  const out = [];
  for (let i = 0; i < coords.length - 1; i++) {
    const a = coords[i], b = coords[i + 1];
    const n = Math.max(1, Math.round(meters(a, b) / stepM));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  if (coords.length) out.push(coords[coords.length - 1]);
  return out;
}

let timer = null;

export function stopSim() {
  if (timer) { clearInterval(timer); timer = null; }
}

// Replay a ride into the nav engine.
//   scenario 'clean'  — drive the whole route end to end.
//   scenario 'detour' — drive ~40% in, swerve 70 m off the line for a few fixes to
//                       trigger a real reroute, then follow the rebuilt route home.
export function startSim(routeCoords, { scenario = 'clean', stepM = 10, stepMs = 600 } = {}) {
  stopSim();
  const src = routeCoords && routeCoords.length >= 2 ? routeCoords : nav.routeCoords;
  if (!src || src.length < 2) return;

  let path = densify(src, stepM);
  let i = 0;
  let coordsRef = nav.routeCoords;          // identity changes when a reroute swaps the route
  let detoured = scenario !== 'detour';
  const detourAt = Math.floor(path.length * 0.4);
  let detourLeft = 4;

  const feed = (lat, lon, brng) =>
    nav.onLocation({ coords: { latitude: lat, longitude: lon, heading: brng, accuracy: 5, speed: 4 } });

  timer = setInterval(() => {
    if (!nav.active) { stopSim(); return; }

    // A reroute replaced the route — follow the NEW path from its start.
    if (nav.routeCoords !== coordsRef) {
      coordsRef = nav.routeCoords;
      path = densify(coordsRef, stepM);
      i = 0;
      detoured = true; // don't swerve again
    }

    // Off-route excursion to trip the reroute.
    if (!detoured && i >= detourAt) {
      const p = path[Math.min(i, path.length - 1)];
      const nx = path[Math.min(i + 1, path.length - 1)];
      const brng = bearing(p, nx);
      const off = project(p, (brng + 90) % 360, 70);
      feed(off[0], off[1], brng);
      if (--detourLeft <= 0) detoured = true;
      return;
    }

    if (i >= path.length) { stopSim(); return; }
    const p = path[i];
    const nx = path[Math.min(i + 1, path.length - 1)];
    feed(p[0], p[1], bearing(p, nx));
    i += 1;
  }, stepMs);
}

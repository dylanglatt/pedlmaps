// Map-matching / route-progress — the backbone for Apple-style guidance.
//
// Instead of reasoning per-maneuver (nearest-point distance, distance to
// maneuvers[idx]), we continuously PROJECT the GPS fix onto the route polyline
// and track how far ALONG the route we are, how far OFF it we are, and the
// route's heading where we matched. Cue timing and reroute decisions all read
// from this one model — the same idea Apple Maps is built on.
//
// Pure (no React Native imports) so it can be unit-tested with plain node.
// Polylines are [[lat, lon], ...]; points are { lat, lon }.

const R = 6371000; // earth radius (m)
const toRad = (d) => (d * Math.PI) / 180;
const toDeg = (d) => (d * 180) / Math.PI;

// Local equirectangular projection to meters around an anchor latitude. Over the
// length of one polyline segment (tens of meters) this is more than accurate
// enough for projection math, and it lets us use flat-plane geometry.
function toXY(lat, lon, lat0) {
  const x = toRad(lon) * Math.cos(toRad(lat0)) * R;
  const y = toRad(lat) * R;
  return [x, y];
}

// Project point p onto segment a->b (all [lat,lon]); returns the clamped
// parameter t in [0,1] and the perpendicular-ish distance in meters.
function projectSeg(p, a, b) {
  const lat0 = a[0];
  const [px, py] = toXY(p.lat, p.lon, lat0);
  const [ax, ay] = toXY(a[0], a[1], lat0);
  const [bx, by] = toXY(b[0], b[1], lat0);
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  const ex = px - cx;
  const ey = py - cy;
  return { t, dist: Math.sqrt(ex * ex + ey * ey), segLen: Math.sqrt(len2) };
}

// Cumulative length (m) up to the start of each segment, so distAlong is cheap.
// Cached on the array instance — route polylines are stable between reroutes.
function cumLengths(coords) {
  if (coords.__cum && coords.__cum.length === coords.length) return coords.__cum;
  const cum = new Array(coords.length);
  cum[0] = 0;
  for (let i = 1; i < coords.length; i++) {
    const a = coords[i - 1];
    const b = coords[i];
    cum[i] = cum[i - 1] + haversine(a[0], a[1], b[0], b[1]);
  }
  try { Object.defineProperty(coords, '__cum', { value: cum, enumerable: false, configurable: true }); } catch {}
  return cum;
}

function haversine(lat1, lon1, lat2, lon2) {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Bearing a->b in degrees (0 = north, 90 = east).
export function segHeading(a, b) {
  const y = Math.sin(toRad(b[1] - a[1])) * Math.cos(toRad(b[0]));
  const x = Math.cos(toRad(a[0])) * Math.sin(toRad(b[0])) - Math.sin(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.cos(toRad(b[1] - a[1]));
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

// Smallest absolute difference between two headings, 0..180.
export function headingDelta(a, b) {
  if (a == null || b == null) return null;
  let d = Math.abs(((a - b) % 360 + 360) % 360);
  return d > 180 ? 360 - d : d;
}

// Project a GPS fix onto the whole route polyline.
// Returns { segIdx, t, lateral (m off route), distAlong (m from route start),
//   snapped:[lat,lon], heading (route heading at the match, degrees) } or null
// for a degenerate route. `hintIdx` (the last matched segment) biases the search
// forward so a route that doubles back near itself snaps to the segment we're
// actually on, not an earlier parallel one.
export function matchToRoute(point, coords, hintIdx = 0) {
  if (!coords || coords.length < 2) return null;
  const cum = cumLengths(coords);
  let best = null;
  // Search a forward-biased window first (cheap + avoids back-snapping), then
  // fall back to a full scan if nothing in-window matched closely.
  const start = Math.max(0, hintIdx - 2);
  const scan = (lo, hi) => {
    for (let i = lo; i < hi; i++) {
      const r = projectSeg(point, coords[i], coords[i + 1]);
      if (!best || r.dist < best.lateral) {
        best = { segIdx: i, t: r.t, lateral: r.dist, segLen: r.segLen };
      }
    }
  };
  scan(start, coords.length - 1);
  // If the windowed best is poor (we likely jumped, e.g. a big GPS error or a
  // shortcut), do a full scan so we still land correctly. When we're tracking
  // well on-route the window match is good and we skip the full scan.
  if (!best || best.lateral > 30) {
    const prev = best;
    best = null;
    scan(0, coords.length - 1);
    // Prefer the forward-window match when both are comparably close, to keep
    // monotonic progress along the route (don't snap backward to a parallel leg).
    if (prev && prev.lateral <= best.lateral + 5) best = prev;
  }
  if (!best) return null;
  const a = coords[best.segIdx];
  const b = coords[best.segIdx + 1];
  const snapped = [a[0] + (b[0] - a[0]) * best.t, a[1] + (b[1] - a[1]) * best.t];
  const distAlong = cum[best.segIdx] + best.segLen * best.t;
  return {
    segIdx: best.segIdx,
    t: best.t,
    lateral: best.lateral,
    distAlong,
    snapped,
    heading: segHeading(a, b),
  };
}

// Total route length (m).
export function routeLength(coords) {
  if (!coords || coords.length < 2) return 0;
  const cum = cumLengths(coords);
  return cum[coords.length - 1];
}

export const _internal = { projectSeg, toXY, haversine, cumLengths };

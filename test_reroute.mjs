// Logic sanity for the reroute DECISION (mirrors voiceNav.onLocation) using the
// real pure modules + the real NAV thresholds. Run:  node test_reroute.mjs
import { matchToRoute, headingDelta } from './lib/mapMatch.js';
import { NAV } from './lib/config.js';

function decide(here, route, heading, speed, matchSeg = 0) {
  const m = matchToRoute(here, route, matchSeg);
  const off = m.lateral > NAV.offRouteM;
  let wrongWay = false;
  if (heading != null && heading >= 0 && speed != null && speed > NAV.minMoveSpeed) {
    const dh = headingDelta(heading, m.heading);
    wrongWay = dh != null && dh > NAV.headingOffDeg;
  }
  const needMs = wrongWay ? NAV.offRouteFastMs : NAV.offRouteSlowMs;
  const bigEnough = wrongWay ? true : m.lateral > NAV.offRouteHardM;
  return { lateral: m.lateral, off, wrongWay, needMs, bigEnough };
}

let pass = 0, fail = 0;
const ok = (c, msg) => { if (c) pass++; else { fail++; console.log('FAIL', msg); } };

const route = [[40.700, -74.00], [40.715, -74.00]]; // due north

let d = decide({ lat: 40.705, lon: -74.00 }, route, 0, 5);
ok(!d.off, 'on-route not off');

d = decide({ lat: 40.705, lon: -73.9994 }, route, 2, 5); // ~50m east, heading north
ok(d.off, 'parallel-right-way is laterally off');
ok(!d.wrongWay, 'parallel-right-way not flagged wrong-way');
ok(!d.bigEnough, 'parallel-right-way under hard gap (no premature reroute)');

d = decide({ lat: 40.705, lon: -73.999 }, route, 2, 5); // ~85m east
ok(d.off && d.bigEnough && !d.wrongWay, 'wide parallel qualifies after slow hold');
ok(d.needMs === NAV.offRouteSlowMs, 'aligned uses slow persistence');

d = decide({ lat: 40.705, lon: -73.9994 }, route, 180, 5); // moving south while off
ok(d.wrongWay, 'south-while-off is wrong-way');
ok(d.needMs === NAV.offRouteFastMs && d.bigEnough, 'wrong-way uses fast persistence');

d = decide({ lat: 40.705, lon: -73.9994 }, route, 180, 0.2); // stationary
ok(!d.wrongWay, 'stationary ignores heading');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

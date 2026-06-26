// Throwaway logic tests for the pure nav modules (mapMatch + maneuvers).
// Run from the project root:  node test_nav.mjs        (Node 18+)
import { matchToRoute, segHeading, headingDelta, routeLength } from './lib/mapMatch.js';
import { collapseManeuvers, isDecision } from './lib/maneuvers.js';

let pass = 0, fail = 0;
const approx = (a, b, tol, msg) => {
  if (Math.abs(a - b) <= tol) { pass++; }
  else { fail++; console.log(`FAIL ${msg}: got ${a}, expected ~${b} (±${tol})`); }
};
const ok = (cond, msg) => { if (cond) pass++; else { fail++; console.log(`FAIL ${msg}`); } };

// ---- mapMatch: a route straight north along a meridian ----
const route = [[40.700, -74.00], [40.710, -74.00]]; // ~1113 m due north
approx(routeLength(route), 1113, 5, 'routeLength meridian');
approx(segHeading(route[0], route[1]), 0, 1, 'segHeading north = 0');

let m = matchToRoute({ lat: 40.705, lon: -74.00 }, route);
approx(m.lateral, 0, 2, 'on-route lateral ~0');
approx(m.distAlong, 556, 8, 'on-route distAlong ~ half');
approx(m.heading, 0, 1, 'on-route heading north');

m = matchToRoute({ lat: 40.705, lon: -73.999 }, route); // ~84 m east
approx(m.lateral, 84, 6, 'east-offset lateral ~84m');

m = matchToRoute({ lat: 40.705, lon: -74.01 }, route);
ok(m.lateral > 700, 'far-off lateral large');

const d1 = matchToRoute({ lat: 40.702, lon: -74.00 }, route).distAlong;
const d2 = matchToRoute({ lat: 40.708, lon: -74.00 }, route).distAlong;
ok(d2 > d1, 'distAlong increases northbound');

approx(headingDelta(350, 10), 20, 0.001, 'headingDelta wrap 350/10');
approx(headingDelta(10, 190), 180, 0.001, 'headingDelta opposite');

const L = [[40.700, -74.000], [40.700, -73.990], [40.701, -73.990], [40.701, -74.001]];
const mm = matchToRoute({ lat: 40.7009, lon: -73.9995 }, L, 2);
ok(mm.segIdx >= 2, 'snaps to later (return) leg');

// ---- maneuvers: decision-point collapsing ----
const W = (instruction, kind, location = [0, 0]) => ({ instruction, kind, location, distance: 0 });
const S = (instruction, maneuver, distance) => ({ instruction, maneuver, location: [0, 0], distance });

const list = [
  S('Head south on Broadway', null, 50),
  S('Continue on Broadway', 'straight', 400),
  S('Continue on Broadway', null, 300),
  S('Turn left onto Grand Street', 'turn-left', 30),
  S('Continue on Grand Street', null, 100),
  W("You've arrived.", 'dest'),
];
const c = collapseManeuvers(list);
ok(c.length === 3, `collapse length 3 (got ${c.length})`);
ok(/Head south on Broadway/.test(c[0].instruction), 'departure kept first');
approx(c[0].distance, 750, 0.001, 'departure absorbs continues (50+400+300)');
ok(/Turn left/.test(c[1].instruction), 'turn kept');
approx(c[1].distance, 130, 0.001, 'turn absorbs trailing continue (30+100)');
ok(c[2].kind === 'dest', 'dest waypoint kept');

const list2 = [
  W('Undock your bike and start riding.', 'pickup'),
  S('Head north on 5 Avenue', null, 60),
  S('Continue on 5 Avenue', 'straight', 500),
  S('Turn right onto 14 Street', 'turn-right', 25),
  W('Dock your bike.', 'dock'),
];
const c2 = collapseManeuvers(list2);
ok(c2.length === 4, `collapse2 length 4 (got ${c2.length})`);
ok(c2[0].kind === 'pickup', 'pickup kept');
ok(/Head north/.test(c2[1].instruction), 'post-waypoint departure kept');
approx(c2[1].distance, 560, 0.001, 'departure absorbs its continue (60+500)');
ok(/Turn right/.test(c2[2].instruction), 'turn kept after collapse');
ok(c2[3].kind === 'dock', 'dock kept');

ok(isDecision({ maneuver: 'turn-left' }), 'turn-left is decision');
ok(isDecision({ maneuver: 'fork-right' }), 'fork is decision');
ok(isDecision({ maneuver: 'keep-left' }), 'keep is decision');
ok(!isDecision({ maneuver: 'straight' }), 'straight not decision');
ok(!isDecision({ maneuver: 'merge' }), 'merge not decision');
ok(!isDecision({ maneuver: null }), 'null not decision');

ok(collapseManeuvers([]).length === 0, 'empty list -> empty');
ok(collapseManeuvers([S('Head west on Main', null, 10)]).length === 1, 'single kept');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

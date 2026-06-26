// Decision-point cue model — mirrors how Apple Maps speaks: it announces only
// where a DECISION is required (turns, forks, merges, the leg's departure
// heading, and our pickup/dock/stop/dest waypoints) and stays silent while you
// simply continue on the same road. A long straight down Broadway should be ONE
// "head south on Broadway" departure, then nothing until the next turn — not a
// "continue on Broadway" at every intersection step the router emits.
//
// Pure (no React Native imports) so it can be unit-tested with plain node.
// Maneuver shape: { instruction, location:[lat,lon], distance, maneuver, kind? }.

// Google maneuver types that represent an actual decision (you must steer).
// "straight" and "merge" keep you going the same way, so they are NOT decisions.
const DECISION = /^(turn-|uturn-|roundabout-|rotary-|fork-|ramp-|keep-)/;

export function isDecision(m) {
  return !!(m && m.maneuver && DECISION.test(m.maneuver));
}

// A maneuver is a "leg departure" if it's the first step overall or the step
// right after a leg-boundary waypoint (pickup/dock/stop). We always voice the
// departure so the rider gets the initial heading ("head south on Broadway").
function isDeparture(ms, i) {
  if (i === 0) return true;
  const prev = ms[i - 1];
  return !!(prev && prev.kind);
}

// Collapse a flat maneuver list to spoken decision points. Kept: waypoints
// (kind set), leg departures, and real turns/forks/mer* decisions. Dropped:
// "continue / straight / stay on" steps — their distance is folded into the
// previous kept maneuver so per-leg distance totals (buildSteps) stay correct.
// We never drop the only instruction, and never drop a waypoint.
export function collapseManeuvers(maneuvers) {
  const ms = maneuvers || [];
  const out = [];
  for (let i = 0; i < ms.length; i++) {
    const m = ms[i];
    const keep = !!m.kind || isDeparture(ms, i) || isDecision(m);
    if (keep) {
      out.push({ ...m });
    } else {
      const last = out[out.length - 1];
      if (last && !last.kind) last.distance = (last.distance || 0) + (m.distance || 0);
      else if (!last) out.push({ ...m }); // never drop the very first instruction
      else {
        // Previous kept item is a waypoint (distance 0) — don't inflate it; fold
        // into the waypoint's following departure instead by keeping this step.
        out.push({ ...m });
      }
    }
  }
  return out;
}

export const _internal = { DECISION, isDeparture };

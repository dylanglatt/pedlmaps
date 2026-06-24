import { FARES } from './config';

// Estimated fare (USD) for one bike rental of `mins` minutes. Pure + provider-
// agnostic so it's unit-testable. Rounds minutes up (you're billed per minute).
//   ebike   = unlock + perMin * mins
//   classic = unlock + overage beyond the included window
export function estimateCost(kind, membership, mins) {
  const r = FARES[membership] || FARES.nonmember;
  const m = Math.max(1, Math.ceil(mins || 0));
  if (kind === 'ebike') return r.unlock + r.ebikePerMin * m;
  const overage = Math.max(0, m - r.classicIncludedMin) * r.classicOveragePerMin;
  return r.unlock + overage;
}

// Sum across bike legs (each leg is a separate rental — multi-stop trips re-dock
// and re-rent, so each leg gets its own unlock + included window). `legSecs` is
// an array of ride-leg durations in seconds.
export function estimateTotal(kind, membership, legSecs) {
  return (legSecs || []).reduce((sum, sec) => sum + estimateCost(kind, membership, sec / 60), 0);
}

// "Free" when there's nothing to pay (member classic within the included window),
// otherwise a 2-decimal dollar amount.
export function fmtUSD(n) {
  return !n || n <= 0 ? 'Free' : `$${n.toFixed(2)}`;
}

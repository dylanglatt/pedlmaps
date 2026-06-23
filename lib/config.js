// Which routing provider to use: 'google' or 'ors'.
// NOTE: Google's Directions/Distance-Matrix/Geocoding APIs do NOT allow browser
// (CORS) calls, so they only work in the native iOS/Android app — not the web
// preview. ORS works everywhere. Tip: keep 'ors' while testing on your laptop,
// switch to 'google' for the phone/dev build.
export const PROVIDER = 'google';

// Keys are read from a local .env file (gitignored) so they're NEVER committed.
// Create a .env file in the project root with:
//   EXPO_PUBLIC_GOOGLE_MAPS_KEY=your_google_key
//   EXPO_PUBLIC_ORS_KEY=your_ors_key        (optional)
// Then restart with:  npx expo start -c
// (Expo inlines EXPO_PUBLIC_* vars at build time. Note: any client-side key is
// still extractable from the built app, so your real protection is the key's
// API restrictions + billing budget cap — not secrecy.)
export const GOOGLE_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY || '';

// OpenRouteService key — free at https://openrouteservice.org (optional fallback).
export const ORS_API_KEY = process.env.EXPO_PUBLIC_ORS_KEY || '';

// Discord webhook for in-app beta feedback (Server Settings → Integrations →
// Webhooks). Kept out of git: set EXPO_PUBLIC_FEEDBACK_WEBHOOK in .env locally
// and as an EAS environment variable (preview env) so OTA builds include it.
export const FEEDBACK_WEBHOOK = process.env.EXPO_PUBLIC_FEEDBACK_WEBHOOK || '';

// Trip-planning tunables.
export const TRIP = {
  candidateStations: 4,   // how many nearby stations to evaluate at each end
  minDocksAtDest: 2,      // require a buffer of open docks so it doesn't fill before you arrive
  maxStationWalkM: 800,   // ignore stations farther than this from your endpoint
  arriveBufferSec: 180,   // "arrive by": leave this much earlier so you're not cutting it exact
  // Predicted (depart/arrive) planning: the whole point of planning ahead is to
  // walk to a station that will actually have a bike, so search wider and prefer
  // stations that TYPICALLY have the bike you want — accepting some extra walk.
  predictedCandidateStations: 8,
  predictedMaxStationWalkM: 1200,
  reliableBikes: 3,       // fallback (no pattern): predicted bikes-of-type = "usually has them"
  reliableDocks: 3,       // fallback (no pattern): predicted open docks = "usually open"
  reliableFullness: 40,   // typical fullness (0-100) of the wanted bike type to count as stocked
  reliableDockFullness: 20, // docks are a SOFT constraint (you can usually dock nearby) — only
                            // block when a dock is typically quite full; bikes are the real limiter
  walkBudgetSec: 300,     // silently swap to a reliable station within this much extra walk (~5 min)
  walkCapSec: 720,        // beyond the budget, still OFFER a reliable station up to this far (~12 min)
};

// Ride-time multiplier applied to Google's "bicycling" estimate by bike type.
// Google assumes a generic cyclist; classic Citi bikes run a bit slower, e-bikes
// a lot faster. Tune to taste. (Walking legs are unaffected.)
export const SPEED = {
  any: 1.0,
  classic: 1.15,
  ebike: 0.62,
};

// Voice-navigation tunables (meters).
export const NAV = {
  preAnnounceM: 70,   // "in ~230 ft, turn left"
  announceM: 22,      // "turn left now"
  offRouteM: 45,      // distance from route before we trigger a reroute
  arriveM: 25,        // considered arrived at a leg endpoint
};

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

// Legal links + contact. PLACEHOLDERS — fill these in once you've bought your
// domain and hosted the policy there. The Privacy link still shows on the primer
// while PRIVACY_URL is empty (it's just a no-op tap), so the layout is final.
export const PRIVACY_URL = 'https://pedlmaps.com/privacy.html';
export const TERMS_URL = '';            // set to show a Terms link too
export const CONTACT_EMAIL = 'hello@pedlmaps.com'; // set up as a free email forward in Namecheap

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

// Spoken-guidance voice. We pick the best installed en-US voice at runtime
// (enhanced/premium if the user has one downloaded, else the system default) and
// read a touch slower than default for clarity. No network — all on-device.
export const VOICE = {
  rate: 0.95,     // slightly slower than the 1.0 default; easier to follow while riding
  pitch: 1.0,
  lang: 'en-US',  // language to match when choosing a voice
  // Force a specific installed on-device voice by identifier. Leave null to
  // auto-pick the best available. Once the [nav] log shows the voices on your
  // device, paste the identifier you like here (e.g.
  // 'com.apple.voice.enhanced.en-US.Evan'). Used for the on-device fallback.
  voiceId: null,

  // Google Cloud Text-to-Speech (reuses EXPO_PUBLIC_GOOGLE_MAPS_KEY). When on and
  // the key + expo-file-system are available, cues are synthesized to cached MP3s
  // at GO and played locally during the ride; anything missing falls back to the
  // on-device voice automatically. Browse voices: cloud.google.com/text-to-speech/docs/voices
  useGoogle: true,
  googleVoice: 'en-US-Neural2-J', // natural male US voice; swap for any Neural2/Chirp3-HD name
};

// Fare ESTIMATE rates (NYC, hardcoded — VERIFY periodically; never billed, shown
// only as an estimate). Source: citibikenyc.com pricing effective Jan 2026.
// Members skip the unlock fee and get 45 included classic minutes; e-bike and
// classic-overage are per-minute. NJ, reduced-fare, and Manhattan e-bike fee caps
// are NOT modeled — that's what the "estimate" label is for.
export const FARES = {
  asOf: 'Jan 2026',
  member:    { unlock: 0,    ebikePerMin: 0.27, classicIncludedMin: 45, classicOveragePerMin: 0.27 },
  nonmember: { unlock: 4.99, ebikePerMin: 0.41, classicIncludedMin: 45, classicOveragePerMin: 0.41 },
};

// Voice-navigation tunables (meters).
export const NAV = {
  preAnnounceM: 70,   // "in ~230 ft, turn left"
  announceM: 22,      // "turn left now"
  offRouteM: 45,      // distance from route before we trigger a reroute
  arriveM: 25,        // hard arrival radius for a waypoint (pickup/dock/stop/dest)
  // Waypoint-geofence robustness (leg boundaries must never be silently missed).
  arriveZoneM: 60,    // "near a waypoint" zone: arms the stationary poll + pass/stationary checks
  passSlackM: 15,     // if we got within the zone then move this much further away, treat as passed-through
  stationaryMs: 12000,// if within the zone and not meaningfully moved for this long, treat as arrived
  stationaryMoveM: 5, // movement under this (m) between fixes counts as "not moving"
  pollMs: 3500,       // while near a waypoint, re-poll location this often so detection runs even when stopped
};

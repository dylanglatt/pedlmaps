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

// Sentry crash/error-reporting DSN. The DSN is NOT a secret — it's embedded in the
// shipped app — so EXPO_PUBLIC_ is correct here. Leave it empty to disable Sentry
// (e.g. on web, or before you've created the project): App.js no-ops when it's blank.
// Set it in .env locally AND as an EAS env var (preview environment) so OTA/store
// builds report crashes. Source-map upload at build time additionally needs a
// SENTRY_AUTH_TOKEN — that one IS a secret, set it as an EAS env var only, never here.
export const SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN || '';

// Beta-only: shows a "Send test crash" button at the bottom of the feedback sheet
// so you can confirm Sentry reporting works end-to-end on a real build. This is a
// plain JS flag (NOT __DEV__) ON PURPOSE — __DEV__ is false in TestFlight, which is
// exactly where Sentry is enabled and where you want to test. Once you've confirmed
// an event lands in the #crashes channel, flip this to false and push to main: it's
// a JS-only change, so the OTA update hides the button with no new native build.
export const DEBUG_TEST_CRASH = false;

// Deep link to the OFFICIAL Citi Bike app — the sanctioned place to see live
// e-bike battery and to unlock a bike (we deliberately don't pull that data
// ourselves; official sources only). openCitiBike() tries the app's URL scheme
// and degrades to the app store / website if it isn't installed. The scheme is
// best-effort (verify on a device); everything still falls back gracefully.
export const CITIBIKE = {
  scheme: 'citibike://',
  iosStore: 'https://apps.apple.com/us/app/citi-bike/id641194843',
  androidStore: 'https://play.google.com/store/apps/details?id=com.citibikenyc.citibike',
  web: 'https://citibikenyc.com',
};

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

  // Voice strategy. When true (default), an installed Enhanced/Premium on-device
  // voice is the PRIMARY voice — fully offline, no network race, so it never
  // switches mid-route (mirrors how Apple Maps speaks). iOS ships only compact
  // voices by default; the Enhanced ones are a one-time user download (Settings →
  // Accessibility → Spoken Content → Voices). If none is installed we fall back to
  // the Google Neural2 voice below (pre-warmed + locked) and nudge the rider to
  // install one. Set false to force the Google voice even when an Enhanced one
  // exists. The on-device compact voice is only ever a last resort.
  preferOnDevice: true,

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
  // Two cues per turn, Apple-style: one advance ("In 500 feet, turn left onto X")
  // and the imminent call ("Turn left onto X") at the corner.
  //
  // The advance cue is SPEED-SCALED (like Apple), not a fixed distance: it fires a
  // roughly constant number of seconds before the turn, so you get more lead at
  // avenue speed and less when crawling. It's then clamped to a sane min/max, and
  // SKIPPED entirely when the run from the previous turn is shorter than
  // shortBlockM (the corner cue alone covers a tight, short-block turn — this is
  // the "block-aware" behavior, since the gap between two turns ≈ the block length
  // on a grid). Spoken distance reflects where you actually are when it fires.
  announceM: 22,        // "turn left" at the corner
  leadSec: 24,          // target seconds of warning before a turn
  leadMinM: 105,        // floor (~345 ft) so a slow/stopped approach still gets a cue
  leadMaxM: 185,        // ceiling (~605 ft) so high speed doesn't fire absurdly early
  fallbackSpeedMps: 5.5,// assumed bike speed (~12 mph) when GPS speed is unavailable
  shortBlockM: 75,      // if the previous turn was nearer than this (~245 ft), skip
                        // the advance cue and just give the corner call
  // Reroute is map-matched (lib/mapMatch.js): we reason about the LATERAL offset
  // from the route line + HEADING vs the route, held over time — not a raw
  // nearest-point count. This rejects GPS noise and a parallel street ridden the
  // right way, while reacting fast when you're clearly going the wrong way.
  offRouteM: 45,      // lateral offset (m) that counts as "off the line"
  offRouteHardM: 65,  // when heading is ALIGNED (likely parallel street), require
                      // this wider offset before recalculating
  offRouteSlowMs: 4000, // must stay off this long when not clearly wrong-way
  offRouteFastMs: 1500, // off this long is enough when heading is clearly wrong-way
  headingOffDeg: 70,  // heading vs route beyond this (deg) = "wrong way"
  minMoveSpeed: 1.0,  // m/s; below this we ignore heading (standing / GPS noise)
  rerouteCooldownMs: 10000, // min gap between reroutes
  rerouteTimeoutMs: 15000,  // if a reroute fetch hangs, resume the old route after this
  // Spoken-cue de-dupe / priority (stops two prompts overlapping).
  dedupeMs: 2000,     // drop an identical cue repeated within this window
  minGapMs: 2500,     // skip a low-priority cue if we just spoke this recently
  arriveM: 25,        // hard arrival radius for a waypoint (pickup/dock/stop/dest)
  // Waypoint-geofence robustness (leg boundaries must never be silently missed).
  arriveZoneM: 60,    // "near a waypoint" zone: arms the stationary poll + pass/stationary checks
  passSlackM: 15,     // if we got within the zone then move this much further away, treat as passed-through
  stationaryMs: 12000,// if within the zone and not meaningfully moved for this long, treat as arrived
  stationaryMoveM: 5, // movement under this (m) between fixes counts as "not moving"
  pollMs: 3500,       // while near a waypoint, re-poll location this often so detection runs even when stopped
};

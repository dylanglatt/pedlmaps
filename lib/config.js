// Which routing provider to use: 'google' or 'ors'.
// NOTE: Google's Directions/Distance-Matrix/Geocoding APIs do NOT allow browser
// (CORS) calls, so they only work in the native iOS/Android app — not the web
// preview. ORS works everywhere. Tip: keep 'ors' while testing on your laptop,
// switch to 'google' for the phone/dev build.
export const PROVIDER = 'google';

// Google Maps Platform key. Enable Directions API, Distance Matrix API, and
// Geocoding API on your Cloud project, then restrict the key to those 3 APIs and
// set a billing budget cap. Paste it here.
export const GOOGLE_API_KEY = 'PASTE_YOUR_GOOGLE_KEY_HERE';

// OpenRouteService key — free at https://openrouteservice.org (optional fallback).
export const ORS_API_KEY = 'PASTE_YOUR_ORS_KEY_HERE';

// Trip-planning tunables.
export const TRIP = {
  candidateStations: 4,   // how many nearby stations to evaluate at each end
  minDocksAtDest: 2,      // require a buffer of open docks so it doesn't fill before you arrive
  maxStationWalkM: 800,   // ignore stations farther than this from your endpoint
};

// Voice-navigation tunables (meters).
export const NAV = {
  preAnnounceM: 70,   // "in ~230 ft, turn left"
  announceM: 22,      // "turn left now"
  offRouteM: 45,      // distance from route before we trigger a reroute
  arriveM: 25,        // considered arrived at a leg endpoint
};

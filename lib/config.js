// OpenRouteService API key — free at https://openrouteservice.org (Dashboard → request a token).
// Paste your token here. (Personal app: fine to keep here; to avoid committing it,
// add `lib/config.js` to .gitignore and share a config.example.js instead.)
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

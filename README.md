# Citi Bike Nav — Expo app

A personal rider tool for NYC Citi Bike:

- **Nearby** — live map of stations color-coded by bikes or docks, e-bike filter,
  and saved home/work stations.
- **Plan a trip** — door-to-door routing that accounts for the walk to a station,
  undocking, the ride, and docking at the *best* station near your destination
  (only ones with an open dock), with **spoken turn-by-turn voice navigation**
  (works with AirPods, screen off).

One codebase runs on **iPhone/Android** and on your **computer** (web) for fast testing.
Station data is the public Citi Bike GBFS feed (no key). Routing uses OpenRouteService
(free key required — see below).

---

## What's in this folder

```
App.js                       # tab switcher + Nearby screen (map, list, refresh)
components/
  StationMap.native.js       # iOS/Android map (react-native-maps)
  StationMap.web.js          # web map (Leaflet) — RN-maps doesn't run on web
  StationList.js             # nearby list with save buttons
  TripScreen.js              # trip planner UI + voice-nav controls
lib/
  gbfs.js                    # fetch + join feeds, derived fields, color logic
  geo.js                     # distance + formatting helpers
  location.js                # cross-platform geolocation (web + native)
  storage.js                 # saved home/work (AsyncStorage)
  config.js                  # ⚙️ your ORS key + tunables  (EDIT THIS)
  routing.js                 # OpenRouteService: geocode / matrix / directions
  tripPlanner.js             # picks best origin+dest station pair
  voiceNav.js                # background location + expo-speech turn-by-turn
```

---

## Setup

You need **Node.js (LTS)**. From this folder:

```bash
npm install
```

Then add a routing key. The app supports two providers, set via `PROVIDER` in `lib/config.js`:

**Google (`PROVIDER = 'google'`)** — best bike routes; needs billing.
1. Google Cloud console → create a project → enable billing.
2. Enable **Directions API**, **Distance Matrix API**, **Geocoding API**.
3. Create an API key, restrict it to those 3 APIs, set a billing budget cap.
4. Paste it into `GOOGLE_API_KEY`.
   - ⚠️ Google's routing APIs block browser (CORS) calls, so trip planning only
     works in the **native app**, not the web preview. Use `'ors'` for laptop testing.

**OpenRouteService (`PROVIDER = 'ors'`)** — free, no card, works on web + native.
1. Sign up at https://openrouteservice.org → Dashboard → request a token.
2. Paste it into `ORS_API_KEY`.

> The "Nearby" tab needs no key. Only "Plan a trip" uses the routing provider.

---

## Run on your computer (fast iteration)

```bash
npx expo start
# press  w   to open the web version in your browser
```

Hot-reloads on save. Trip planning and the map work on web; **voice navigation’s
background/screen-off behavior is iOS/Android only** (browsers can’t run a background
location task), though you can still hear instructions with the tab open.

---

## Run on your phone

The Nearby map runs in **Expo Go** (scan the QR from `npx expo start`).

**Voice navigation needs a dev build**, not Expo Go — background location + the
foreground service aren’t available in Expo Go. Since you have an Apple Developer
account, build once with EAS and install on your device:

```bash
npm install -g eas-cli
eas login
eas build:configure
eas build --profile development --platform ios   # also: --platform android
```

Install the resulting build, then run `npx expo start --dev-client` and open it from
your phone. This build can stay on your device permanently (no 7-day expiry).

---

## Using it

**Nearby tab**
- *Need a bike / Need a dock* re-ranks and recolors every station.
- *⚡ E-bikes* (bike mode) counts only stations with e-bikes available.
- Tap 🏠 / 💼 on a row to save home/work — live counts show up top, persist across launches.
- Colors: green = 3+ available, amber = 1–2, grey = none, dark = not renting/returning.
- Counts exclude broken bikes; "N down" flags disabled bikes.

**Plan a trip tab**
- Enter a destination (leave "From" blank to use your current location).
- Choose Any / Classic / E-bike — origin stations are filtered to that type.
- It evaluates the nearest few stations at each end and picks the combination with the
  lowest **walk + ride + walk** total. It only sends you to a start station with a bike
  and an end station with an open dock (a 2-dock buffer by default), and shows alternates.
- Tap **🔊 Start voice navigation** for spoken turn-by-turn. It speaks each maneuver as
  you approach, says "undock"/"dock" at the transitions, re-routes if you go off course,
  and announces arrival. Audio routes to AirPods automatically.

Tunables (candidate count, dock buffer, announce distances) live in `lib/config.js`.

---

## Notes & limits

- **Live ≠ on-arrival.** Availability is current-moment; a single open dock can fill
  while you ride. The planner prefers a dock buffer and re-checks, but always glance at
  the alternates. Increase `minDocksAtDest` in `config.js` for more safety margin.
- **GBFS** polled every 45s; keeps last-good data on a fetch hiccup.
- **ORS free tier** is ~2,000 requests/day — far more than personal use; each trip plan
  is 3 matrix calls + a few directions calls.
- **Web location** needs `localhost`/`https` (Expo serves localhost in dev).

## Next ideas
- Re-check dock availability mid-ride and re-pick the end station if it’s filling.
- Push alerts ("home station empty at 8am") via `expo-notifications` + a scheduled check.
- Show the planned route as a polyline on the map.

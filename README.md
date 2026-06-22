# Citi Bike Nearby — Expo app

A personal rider tool: live map of nearby Citi Bike stations, color-coded by bikes
or docks, with an e-bike filter and saved home/work stations. One codebase runs on
your **iPhone/Android** (via Expo Go) and on your **computer** (web) for fast testing.

Built on the public Citi Bike GBFS feeds — no API key required.

---

## What's in this folder

```
App.js                       # main screen: controls, map, list, refresh loop
components/
  StationMap.native.js       # iOS/Android map (react-native-maps)
  StationMap.web.js          # web map (Leaflet) — RN-maps doesn't run on web
  StationList.js             # nearby list with save buttons
lib/
  gbfs.js                    # fetch + join feeds, derived fields, color logic
  geo.js                     # distance + formatting helpers
  location.js                # cross-platform geolocation (web + native)
  storage.js                 # saved home/work (AsyncStorage)
```

> `StationMap` resolves automatically: Metro picks `.native.js` on phones and
> `.web.js` in the browser. You import it as `./components/StationMap`.

---

## Setup (one time)

You need **Node.js (LTS)** installed. Then create a fresh Expo project and drop these
files in. This guarantees you get versions that match your installed Expo Go.

```bash
# 1. Create a blank Expo app
npx create-expo-app@latest citibike --template blank
cd citibike

# 2. Copy the files from THIS folder over the new project:
#    - replace App.js
#    - add the lib/ and components/ folders
#    (drag-and-drop in Finder, or cp -r the folders in)

# 3. Install native + storage deps (expo install picks matching versions)
npx expo install react-native-maps expo-location @react-native-async-storage/async-storage

# 4. Install the web map libs (plain npm packages)
npm install leaflet react-leaflet
```

---

## Run on your computer (test functionality)

```bash
npx expo start
# press  w   to open the web version in your browser
```

The web build hot-reloads on save — the fastest way to iterate on logic and layout.
It'll ask for browser location permission; if you deny, it falls back to Midtown.

## Run on your phone (real feel + GPS)

1. Install **Expo Go** from the App Store / Play Store.
2. Run `npx expo start` and scan the QR code (iPhone: Camera app; Android: Expo Go).
3. Allow location when prompted.

`react-native-maps`, `expo-location`, and AsyncStorage all run inside Expo Go, so no
build step is needed to test on your phone.

---

## Using it

- **Need a bike / Need a dock** toggle re-ranks and recolors every station.
- **⚡ E-bikes** filter (bike mode only) counts only stations with e-bikes available.
- Tap the 🏠 / 💼 icons on a list row to save your home and work stations — they show
  live at the top (bikes at home, docks at work) and persist across launches.
- Colors: green = 3+ available, amber = 1–2, grey = none, dark = not renting/returning.
- Counts already exclude broken bikes; "N down" flags disabled bikes at a station.

---

## Notes & limits

- **Data:** Citi Bike GBFS, polled every 45s. Feeds update ~every 30s; the header shows
  station count and any fetch error (it keeps showing last-good data on a hiccup).
- **Location on web** requires `https://` or `localhost` — `expo start` serves localhost,
  so it works in dev.
- **iOS production build** (standalone, not Expo Go) needs a location-usage string in
  `app.json` under `ios.infoPlist.NSLocationWhenInUseUsageDescription`, and an Apple
  Developer account for a permanent install. Not needed for Expo Go testing.

## Next: push alerts (later)

The "alert me when my home station is empty at 8am" feature needs:
`npx expo install expo-notifications`, a small background check, and an
[EAS Build](https://docs.expo.dev/build/introduction/) dev build (Expo Go can't do
background push). The current code keeps home/work saved so this drops in cleanly.

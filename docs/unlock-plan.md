# Unlock feature — GBFS-sourced, multi-system

## Goal

Make the "unlock a bike" action work across any GBFS bikeshare system (not just NYC
Citi Bike) and support opening either the operator's own app or Lyft. Source deep links
from GBFS itself — never hardcode a city's app URL. JS-only, OTA-safe (no native modules).

## Core principle

The unlock link comes from **GBFS `rental_uris`**, not a hardcoded domain. Each station in
`station_information.json` carries a `rental_uris` object with `ios` / `android` / `web`
universal links, provided by the operator, that deep-link straight to *that station's*
unlock with no interstitial. This is station-specific, city-agnostic, and inside the
legit-data principle (official operator links only). See gbfs.md `rental_uris`.

## What to build

### 1. Carry rental_uris through the GBFS layer (`lib/gbfs.js`)
- Parse and expose each station's `rental_uris` (`ios`, `android`, `web`). Keep alongside
  the existing derived fields (like `shortName`). Tolerate feeds that omit it (older/edge
  systems) — treat as null and fall back (see §4).

### 2. System-level config for the Lyft alternative (`lib/config.js` or new `lib/systems.js`)
- GBFS gives the operator's primary app link, but "open in Lyft instead" is a cross-system
  convenience GBFS does not encode. Add a small override table keyed by GBFS system id:
  ```
  systems = {
    "<gbfs system_id>": {
      name: "Citi Bike",        // display; can also read system_information.name
      lyftLink: "https://www.lyft.com/...",  // Lyft deep link for this network, or null
    },
    ...
  }
  ```
  Only Lyft-operated networks get a non-null `lyftLink`. Systems absent from the table
  simply have no Lyft option (button hides the escape hatch).

### 3. Preference generalizes (`lib/storage.js`, key `dockhop.unlockApp.v1`)
- Change the stored value from "citibike | lyft" to a boolean intent:
  `preferLyft: false` (default). Applied per-station: `preferLyft && system.lyftLink`
  → open Lyft; otherwise open the station's `rental_uris.ios`.
- Do NOT rename the AsyncStorage key. If a value is already stored under the old shape,
  migrate it on read.

### 4. Launch resolver (`lib/unlock.js`)
- `resolveUnlockUrl(station, systems, preferLyft)`:
  1. if `preferLyft` and the station's system has a `lyftLink` → return it
  2. else return `station.rental_uris.ios` (Universal Link; OS falls back to web/App Store)
  3. else (no rental_uris) → fall back to `system.appStoreUrl` or the web link
- Open with `Linking.openURL`. HTTPS/universal links only — no undocumented custom schemes.

### 5. UI
- **Home screen (App.js):** keep the prominent primary "Unlock a bike" button, but trim its
  vertical padding slightly — it currently reads as too tall. Below it, the quiet secondary
  link is shown ONLY when the current system has a `lyftLink`. Label reflects the non-active
  target ("Use Lyft instead" / "Use <operator> instead"); tapping switches silently +
  one-time toast; symmetric.
- **Live navigation (NavScreen.js):** replace the large dark "Undock your bike" banner with a
  single compact control (slim bottom pill, e.g. "Unlock a bike ›"). Remove the duplicate
  headline. Nav honors the saved preference silently — no escape-hatch link in nav; the choice
  is made on the home screen / Settings.
- **Settings:** the "Unlock with" row now offers operator app vs Lyft (only meaningful where a
  `lyftLink` exists); this maps to the `preferLyft` boolean.

## Forward-compat note (not in scope now)
Serving other cities also needs multi-feed loading + detecting which system a station belongs
to. That is a separate data task. This change only makes the unlock layer city-agnostic so
adding a city later is data, not a rewrite.

## Verification
- `node --check` on all changed/new files.
- Throwaway node script asserting `resolveUnlockUrl`:
  - preferLyft + system has lyftLink → returns lyftLink
  - preferLyft + no lyftLink → returns rental_uris.ios
  - !preferLyft → returns rental_uris.ios
  - no rental_uris → returns the configured fallback
  - old-shape stored pref ("citibike"/"lyft") migrates correctly
- Note in summary: actual app launch + iOS "back to app" breadcrumb need a real-device pass;
  simulator and CI can't verify the hand-off.

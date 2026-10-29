# pedl — project guide for Claude Code

Personal NYC Citi Bike rider tool. Cross-platform **Expo / React Native** (RN 0.85,
React 19, Expo SDK 56) running on iOS, Android, and web. Brand displayed as **Pedl**.
Repo: github.com/dylanglatt/citi-bike-app · slug `citibike` · bundle `com.dylanglatt.citibike`.

Two features:
- **Nearby** — live GBFS station map color-coded by bikes/docks, bike-type filter
  (Both/Electric/Manual), saved home/work, "popular times" availability chart per station.
- **Plan a trip** — door-to-door walk→ride→walk routing that picks the best origin+dest
  station pair (reliability-aware), optional single intermediate stop with drag-to-reorder,
  and spoken turn-by-turn voice nav that runs screen-off via background location.

## Commands

```bash
npm install                 # install deps
npx expo start              # dev server; press w for web preview
npx expo start -c           # same, clears cache (needed after editing .env)
npx expo start --dev-client # run against an installed dev build (for voice nav)
```

There is **no test framework**. The trip planner is checked with ad-hoc Node scripts that
import and exercise the pure functions (e.g. `choosePredicted`, `planTrip`). When you change
planner logic, write/run a throwaway `node` script that requires the function and asserts
the cases, plus `node --check <file>` (or `py_compile` for scripts/). See `/planner-test`.

### Shipping (OTA vs native build) — important

- **OTA-safe changes** (JS/TS only — no new native modules, permissions, icon, or name):
  just push to `main`. CI (`.github/workflows/eas-update.yml`) publishes an EAS Update to the
  **`preview`** channel automatically. The TestFlight/dev build picks it up on next launch.
- **Native changes** (new native dep, app icon/name, permissions, new Apple target) need a real
  build. **TestFlight builds use the `production` profile** (store distribution):
  `eas build --profile production --platform ios`, then `eas submit --platform ios --latest`.
  The `preview` profile is `distribution: internal` (ad hoc, registered devices only) and can't
  go to TestFlight. TestFlight builds expire after 90 days. This is a **managed / CNG** project — `ios/`
  is gitignored and regenerated from `app.json` + config plugins on every build (EAS prebuilds in
  CI), so all native config lives declaratively in `app.json` (`ios.infoPlist`, `expo-location`
  plugin, android permissions). The pedl name + icon already ship via EAS (TestFlight), so there is
  NO pending "rebrand prebuild" and no committed Xcode project to worry about — adding native
  features (e.g. a WidgetKit target) means adding a config plugin + entitlement, not hand-editing
  `ios/`.
- `eas.json`: the **production** profile deliberately uses `channel: preview` + `environment:
  preview` so the store build keeps receiving the same OTA pushes and EAS-hosted env vars.
  All app env vars live in the EAS **preview** environment; the EAS `production` environment is
  nearly empty, so don't point a profile at it without copying the vars over first.

## Architecture

- `App.js` — tab switcher + the Nearby screen (map, station list, refresh, BETA pill).
- `components/` — UI. Map components are **platform-split**: `*.native.js` uses
  `react-native-maps`, `*.web.js` uses Leaflet. Key ones: `TripScreen.js` (planner UI),
  `NavScreen.js` (voice nav UI), `RouteMap.*`, `StationMap.*`, `StationSheet.js` (popular-times
  chart), `SavedPlacesRow.js` / `FavoritesManager.js` (saved places), `ReorderPair.js`
  (drag-to-swap stop/dest, custom PanResponder — no native dep, OTA-safe).
- `lib/` — logic:
  - `gbfs.js` — Lyft GBFS feeds, derived fields, color levels. Carries `shortName` (see join gotcha).
  - `tripPlanner.js` — candidate stations + matrix → best plan. `planTrip` ranks by
    `totalSec + riskPenalty(originBikes) + riskPenalty(destDocks)`. `planMultiTrip` chains legs.
  - `voiceNav.js` — singleton `NavController`, background `TaskManager` task `CITIBIKE_NAV_TASK`.
  - `routing.js` — facade delegating to `routingGoogle.js` / `routingOrs.js` per `PROVIDER`.
  - `predictions.js` + `availability.json` — popular-times pattern (see "predictions" gotcha).
  - `config.js` — **all tunables + keys live here**. Edit this for behavior knobs.
  - `savedPlaces.js`, `places.js`, `placeIcon.js`, `geo.js`, `location.js`, `storage.js`, `theme.js`.
- `scripts/` — Python data pipeline (`agg_availability.py`, `finalize_availability.py`,
  `snapshot_availability.py`, `check_accuracy.py`).

## Conventions & gotchas (read before editing)

- **Routing provider** is `google` (`lib/config.js` `PROVIDER`). Google blocks browser CORS, so
  **trip planning only works in the native app** — switch `PROVIDER` to `'ors'` for laptop/web testing.
- **Keys come from a gitignored `.env`** as `EXPO_PUBLIC_*` vars (`EXPO_PUBLIC_GOOGLE_MAPS_KEY`,
  `EXPO_PUBLIC_ORS_KEY`, `EXPO_PUBLIC_FEEDBACK_WEBHOOK`). Expo inlines them at build; for OTA they
  must also be set as EAS env vars in the **preview** environment. `.env.example` documents names.
  Never commit secrets. After editing `.env`, restart with `npx expo start -c`.
- **Voice nav needs a dev build** (not Expo Go) — background location + foreground service.
- **Don't rename AsyncStorage keys** (`dockhop.places.v1`, `dockhop.units.v1`, `dockhop.recents.v1`)
  — renaming wipes existing users' data. The "dockhop" prefix is intentional legacy.
- **GBFS join gotcha:** GBFS `station_id` is a UUID that does NOT match trip-data IDs. Join via
  GBFS `short_name` (== trip-data station_id, e.g. "5872.10"). `gbfs.js` carries `shortName`.
- **Unlock links come from GBFS, never hardcoded.** The "unlock a bike" action deep-links via each
  station's GBFS `rental_uris.ios` (operator-provided universal link, station-specific) — this keeps
  it city-agnostic and inside the legit-data principle. Don't hardcode per-city app URLs. The only
  hardcoded piece is the optional per-system Lyft alternative (`lib/systems.js`), since GBFS doesn't
  encode "open in Lyft instead". See [docs/unlock-plan.md](./docs/unlock-plan.md).
- **Predictions are RELATIVE, not absolute.** `availability.json` encodes each station's own
  daily *shape* (busiest hour=100, emptiest=0), NOT "how many bikes at 9am". Its only valid use is
  the popular-times chart. Absolute-availability features (predicted planning / smart pickup /
  depart-arrive) were scoped OUT for this reason; the code is left dormant. Re-enabling needs real
  `station_status` snapshot history — that's what `scripts/snapshot_availability.py` collects.
- **Map markers** use a shape+number+flag+color vocabulary (origin=blue dot, stop=indigo numbered
  square, dest=red flag, pickup=green bike, dock=blue P). Route line is Apple-blue with white casing.
  Mirror Apple Maps *conventions*; keep the pedl brand (indigo/teal). Theme tokens in `lib/theme.js`.
- **Native-only APIs can't be tested here or on web** (react-native-maps, Google routing, background
  location). Changes touching those need a **device pass** before trusting. Be explicit in summaries
  about what was verified vs what still needs device testing.

## Current state

Working tree typically on `main`. Active work: a **voice-nav arrival fix** (NavScreen.js,
TripScreen.js, lib/voiceNav.js, lib/config.js modified). Outstanding work is tracked in
[TODO.md](./TODO.md). Beta basics (Sentry crash reporting, feedback webhook, snapshot collection)
are still unbuilt.

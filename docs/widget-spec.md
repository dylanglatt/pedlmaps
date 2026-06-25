# Pedl — Favorite Stations Home-Screen Widget (build spec)

A spec for implementing an iOS WidgetKit widget that shows live availability for the
user's favorite Citi Bike stations. Written to be handed to Claude Code, which can run
`prebuild` / `eas build` and iterate in Xcode. **Cowork could not compile Swift, so this
has not been built or verified — treat it as a starting point and expect to iterate.**

## Goal

A home-screen widget (small + medium) that shows a favorite station's live availability,
configurable per widget (which station + which metric), tap to open the app. Must reuse the
existing favorites the app already stores — no new in-app data model.

## Project context (read first)

- **Managed / CNG Expo app.** `ios/` is gitignored and regenerated from `app.json` + config
  plugins on every build (EAS prebuilds in CI). All native config is declarative in `app.json`.
  Do NOT hand-edit a committed Xcode project — there isn't one. Add the widget via a config
  plugin so it survives prebuild.
- **Bundle id:** `com.dylanglatt.citibike`. App name: Pedl. EAS project is configured
  (`eas.json` has development/preview/production profiles).
- **Favorites already exist.** `lib/savedStations.js` persists favorite station ids in
  AsyncStorage under key **`dockhop.favstations.v1`** as a JSON array of GBFS `station_id`
  strings (UUIDs). Do NOT rename that key. Favorites are added via the gold star in
  `components/StationSheet.js` and surfaced in `components/StationList.js`.
- **GBFS feeds** (public, no key, CORS-enabled), NYC system `bkn`:
  - `station_status`: `https://gbfs.lyft.com/gbfs/1.1/bkn/en/station_status.json`
    — fields per station: `station_id`, `num_bikes_available`, `num_ebikes_available`,
    `num_docks_available`. Derive `classic = max(0, num_bikes_available - num_ebikes_available)`.
  - `station_information`: `https://gbfs.lyft.com/gbfs/1.1/bkn/en/station_information.json`
    — `station_id`, `name`, `short_name`, `lat`, `lon`. (Static; only needed if you don't
    store names in the App Group — see below.)
- The in-app station object's `id` IS the GBFS `station_id` (see `lib/gbfs.js`), so favorite
  ids match `station_status.station_id` directly — no remapping needed.

## Architecture

1. **App Group** `group.com.dylanglatt.citibike` shared between the app and the widget
   extension (entitlement on both).
2. **RN → App Group bridge.** Whenever favorites change (and on app foreground), the app
   writes the favorites list to the App Group so the widget and its config picker can read
   them without launching the app. Payload: an array of `{ id, name, shortName }` (pull
   `name`/`shortName` from the live GBFS station objects the app already has in `App.js`).
   - Implementation options (pick the cleanest current one): a small Expo native module, or a
     maintained lib that writes to a shared `UserDefaults(suiteName:)` / App Group container.
   - Also trigger `WidgetCenter.shared.reloadAllTimelines()` (native side) when favorites
     change so the widget updates its station set promptly.
   - Hook point: `toggleFav` / `favIds` in `App.js` (and the favorites resolution memo there
     already has the names you need).
3. **Widget extension (Swift / SwiftUI), added via config plugin** (e.g. `@bacons/apple-targets`
   or equivalent). Contains:
   - **AppIntent configuration** (iOS 17+ `AppIntentConfiguration`):
     - `station` parameter — dynamic options sourced from the App Group favorites (used by the
       small widget to pick which favorite).
     - `metric` parameter — enum: **E-bikes**, **Classic**, **Any bikes**, **Open docks**
       (mirrors the in-app Electric / Classic / Any filter + the Bikes/Docks toggle).
   - **TimelineProvider** — on each refresh: read config (station + metric) and favorites from
     the App Group, fetch `station_status`, compute the chosen metric per station, return a
     timeline entry; refresh policy `.after(~20 min)`. Keep network light: one `station_status`
     fetch per refresh (it's a few hundred KB). Names come from the App Group payload (so no
     `station_information` fetch needed).
   - **Views:**
     - **Small:** station name (use the place-style short label if available), big metric
       number, a small metric label (e.g. "e-bikes"), and "updated Xm ago". Color the number
       by level if easy (green plenty / amber low / gray none) to match the app badge.
     - **Medium:** up to ~4 favorites as rows (name + number), a header, and a timestamp.
   - **Tap target:** `widgetURL(URL(string: "pedl://station/<id>"))`. Requires registering the
     URL scheme (below). v1 can simply open the app (`pedl://`); deep-linking to the station
     sheet is a nice follow-on (handle the URL in `App.js` via `Linking`).

## app.json changes

- Add the Apple-targets config plugin (and its `targets/` directory or equivalent) so the
  widget extension + App Group entitlement are generated on prebuild.
- Add the App Group entitlement to BOTH the app and the widget target.
- Add a URL scheme for the tap deep link: `"scheme": "pedl"`.
- Keep all existing config intact (`expo-location` plugin, `ios.infoPlist` location/background
  modes — the widget must not disturb voice-nav config).

## Build & verify

1. `npx expo prebuild -p ios --clean` locally to sanity-check generation (or rely on EAS).
2. `eas build --profile development --platform ios`, install on a device.
3. Add the widget to the home screen, long-press → Edit → pick a station + metric, verify the
   live number matches the app, and that "updated" advances. Test small + medium.
4. Confirm voice nav still works (regression check — the prebuild touched native config).
5. When green, ship via the normal flow.

## Constraints & notes

- **iOS 17+** for `AppIntentConfiguration`. If iOS 16 support is required, fall back to the
  older `IntentConfiguration` + SiriKit intent — but prefer 17+ to keep it simple; set the
  widget target's deployment target accordingly.
- **Empty state:** no favorites → widget shows "Star a station in Pedl" (don't crash/blank).
- **Error/stale:** GBFS fetch fails → show the last known value with a stale "updated" time,
  or an em dash; never show a wrong-but-confident number.
- **Don't rename** the `dockhop.*` AsyncStorage keys.
- This is a **native build** (not OTA). It rides `eas build`, not the eas-update OTA channel.

## Acceptance criteria

- [ ] Adding the widget, configuring station + metric, shows the correct live number (matches
      the in-app station sheet for that station + filter).
- [ ] Metric options work: E-bikes / Classic / Any bikes / Open docks.
- [ ] Small (one station, configurable) and medium (several favorites) both render.
- [ ] Widget refreshes on its own (~20 min) and promptly after favorites change in the app.
- [ ] Tapping opens Pedl (bonus: opens the tapped station).
- [ ] No favorites → friendly empty state. GBFS failure → graceful, no false numbers.
- [ ] Voice nav and existing features still work after the native rebuild.

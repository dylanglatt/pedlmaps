# Pedl → App Store: Claude Code prompt pack

Phased prompts to execute [`docs/app-store-launch.md`](./app-store-launch.md). Run them from the
repo root in Claude Code, **one phase at a time**, reviewing between phases.

**Why phased:** Phases 1–2 are OTA-safe (JS only) and can be verified on your existing TestFlight
build within minutes of pushing. Phase 4 is the single native build. Running it all as one prompt
would mix those cycles and give Claude Code no checkpoint to be corrected at.

**Decisions already baked in** (from 2026-08-19):
- iOS only for v1.
- De-brand + disclaimer on the Citi Bike trademark question.
- **iPad dropped** (`supportsTablet: false`).
- **Google Neural2 voice kept**, on a separate TTS-only key — see the note in Phase 0.

**Deliberately left out** (see the appendix if you change your mind): production OTA channel
split, a terms page, widget work.

---

## Phase 0 — the Google key split (~40 min, mostly you)

⚠️ **Order matters here.** The obvious move — go into the console and lock the key down — breaks
your live TestFlight build. Read 0.1 before opening the console.

### 0.1 Why you can't just restrict the key

The `iOS apps` application restriction is built for the iOS **SDKs** (Maps SDK for iOS, Places SDK
for iOS). Pedl doesn't use those. It calls the Maps **web service** APIs over plain `fetch`
(`lib/routingGoogle.js`, `lib/places.js`). Per
[Google's Maps Platform security guidance](https://developers.google.com/maps/api-security-best-practices),
a client app calling web services directly has to send an **`X-Ios-Bundle-Identifier` header** for
that restriction to pass — otherwise every call comes back `REQUEST_DENIED`. Pedl sends no such
header today.

And Cloud Text-to-Speech isn't Maps Platform at all, so it has no bundle-header path. API
restriction is the only lever on that one.

So: **code first, then keys, then restrictions** — with a device check in between.

### 0.2 Code change (Claude Code, OTA-safe)

> **Copy from here** ⬇

Two small changes, both JS-only and OTA-safe. Read `docs/app-store-launch.md` §2.7 first.

**1.** Pedl calls Google Maps *web service* APIs directly from the client with plain `fetch`, which
means an `iOS apps` API-key restriction will reject every call unless the app sends the
`X-Ios-Bundle-Identifier` header (see
https://developers.google.com/maps/api-security-best-practices). Add that header, with the value
`com.dylanglatt.citibike`, to every Google API request in `lib/routingGoogle.js` (the geocode call
at :51, distancematrix at :75, directions at :107) and `lib/places.js` (:18 and :45 — that file
already sends headers). Read the bundle ID from `app.json` via expo-constants if that's clean to do
here rather than hardcoding a second copy of it; if it isn't, hardcode it with a comment pointing
at `app.json`. Don't change any request's URL, params, or response handling.

**2.** `lib/ttsGoogle.js:6` currently imports the shared `GOOGLE_API_KEY`. Cloud TTS is going onto
its own separate Google Cloud key, because it can't take an application restriction and I don't
want an extracted key to reach Maps. Add a `GOOGLE_TTS_KEY` export to `lib/config.js` reading
`process.env.EXPO_PUBLIC_GOOGLE_TTS_KEY`, following the existing comment style there, and switch
`ttsGoogle.js` to it — including the `isConfigured` check at :32 and the fetch at :72. Make it fall
back to `GOOGLE_API_KEY` if `GOOGLE_TTS_KEY` is empty, so nothing breaks before I've set the new
var. Add the new name to `.env.example`.

Run `node --check` on every file you touch. Tell me what you changed and what I need to verify on
a device (both of these are native-path only). Don't commit.

> **Copy to here** ⬆

### 0.3 Create the keys — unrestricted at first

Google Cloud console → **APIs & Services → Credentials → Create credentials → API key**, twice.

- **Key A (Maps/Places)** — you can reuse your existing key for this.
- **Key B (TTS)** — new.

Leave both **unrestricted for now.** Then:

- Add `EXPO_PUBLIC_GOOGLE_TTS_KEY` to your local `.env` (Key B).
- Add it as an **EAS environment variable in the `preview` environment** too — that's how it reaches
  OTA builds, same as your existing vars (per `CLAUDE.md`).
- Restart with `npx expo start -c` — `.env` changes need the cache clear.

### 0.4 Ship it and verify on device

Push 0.2 to `main` so CI publishes the OTA update, then on your phone confirm **trip planning still
works** (that's the header change) and **voice nav still speaks in the Neural2 voice** (that's the
key split). If voice silently degrades to the on-device voice, `GOOGLE_TTS_KEY` didn't reach the
build — check the EAS env var before going further.

### 0.5 Now apply the restrictions

Back in **Credentials**, edit each key:

- **Key A** → Application restrictions: **iOS apps**, add bundle ID `com.dylanglatt.citibike`.
  API restrictions: **Restrict key** → Directions API, Distance Matrix API, Geocoding API,
  Places API (New).
- **Key B** → Application restrictions: **None** (nothing else is possible for Cloud TTS).
  API restrictions: **Restrict key** → **Cloud Text-to-Speech API only.** This is the whole point —
  it bounds the blast radius if the key is pulled out of the bundle.

Restrictions can take a few minutes to propagate. **Re-verify on device afterwards** — plan a trip
and start nav. If routing breaks, the header from 0.2 isn't landing; loosen Key A back to
unrestricted while you debug rather than leaving your testers broken.

### 0.6 Quota and budget

- **IAM & Admin → Quotas & System Limits**, filter to Cloud Text-to-Speech. The Neural2 default is
  **1,000 requests/minute/project** — far more than you need. Set a quota override well below it
  (60/min is generous for one app). **This is your real abuse ceiling.**
- **Billing → Budgets & alerts** → a budget with alert thresholds on the project.

Be clear-eyed about the limits of that last one: Google Cloud's *spend cap* budgets genuinely block
usage, but they currently only cover Gemini API, Agent Platform, Cloud Run, and Cloud Run functions
— **not** Text-to-Speech or Maps. For TTS you get alerts, not a hard stop. The complete fix is
proxying TTS through your droplet so the key never ships at all; that's a good 1.1 item, but it
puts new infrastructure on the critical path of your differentiator feature, which is the wrong
trade right before a launch.

### 0.7 Sentry auth token

Find or regenerate the Sentry token that 401'd back in `b80c55d`. Phase 4 re-enables source-map
upload with it; without it every crash report arrives minified and useless.

### 0.8 Clean the tree

You have uncommitted changes in `App.js` and `lib/systems.js` (the Lyft deep-link work), plus an
untracked `.claude/settings.json.bak`. Commit or revert before Phase 1 so Claude Code starts from a
known baseline — Phase 1's prompt tells it to stop if the tree is dirty.

---

## Phase 1 — OTA blockers

> **Copy from here** ⬇

Read `CLAUDE.md` and `docs/app-store-launch.md` first — the launch plan has the full reasoning and
file:line references for everything below. Follow this repo's conventions, especially: there is no
test framework, so verify pure functions with throwaway `node` scripts and every touched file with
`node --check`.

Before starting, run `git status`. If the working tree is dirty, stop and tell me — do not stash or
commit my changes for me.

Fix these five blockers. All are JS-only and must stay OTA-safe: **do not** add a native dependency,
change `app.json`, or touch permissions/icon/name in this phase. If a fix seems to require any of
those, stop and tell me instead of doing it.

**1. Nav bricks silently when location was denied (plan §2.1).**
`components/NavScreen.js:189` calls `nav.start({...})` with no `await` and no `.catch()`, inside a
`useEffect`. `lib/voiceNav.js:334` throws `'Location permission needed for navigation.'` when
foreground permission isn't granted, and `Location.startLocationUpdatesAsync` can reject too. The
result today is an unhandled rejection, `_ready` never set, a frozen banner, and no error shown.
This is reachable in production: a user who denied location still gets the Midtown fallback, can
plan a trip, and can tap GO.

Catch the failure and render a real error state on the nav screen — a short explanation plus an
"Open Settings" action wired to `Linking.openSettings()` (see the existing pattern at
`App.js:229-239`) and a way back out of nav. Make sure the controller is left in a clean state so a
second GO after granting permission works. Distinguish the permission-denied case from a generic
start failure in the copy.

**2. Sentry is shipping precise location and the Google API key (plan §2.2).**
Sentry's default breadcrumb integration records XHR/fetch URLs, and React Native's `fetch` runs on
XHR. So every routing call is breadcrumbed onto error events, carrying the user's exact coordinates
and the API key in the query string: `lib/routingGoogle.js:51` (geocode — also the user's typed
search text), `:75` (distancematrix), `:107` (directions), and `lib/ttsGoogle.js:72` (synthesize).
`tracesSampleRate: 0.2` creates HTTP spans carrying the same URLs.

In the `Sentry.init` at `App.js:37-43`, add scrubbing that strips the query string (keep scheme,
host, and path; drop everything from `?` onward) from any URL whose host is `maps.googleapis.com`,
`places.googleapis.com`, or `texttospeech.googleapis.com`. Cover both breadcrumbs and event data —
check the installed `@sentry/react-native` version's API in `node_modules` for the correct hook
names rather than guessing, and note that span/transaction descriptions carry URLs too, not just
breadcrumbs. Also set `tracesSampleRate: 0` for v1 with a comment saying why, and add a brief
comment block explaining what is scrubbed and why, so it doesn't get removed later.

Then prove it: write a throwaway node script that feeds representative breadcrumb and event objects
(built from real URL shapes from those four call sites) through your hook and asserts no `key=`,
no `origins=`, no `destinations=`, no lat/lon, and no `address=` survives. Show me the output.

**3. Background "Always" location is requested with no priming (plan §2.3).**
`lib/voiceNav.js:344` fires `requestBackgroundPermissionsAsync()` inside a bare `try {} catch {}`,
mid-flow right after GO, with no explanation and no handling of denial — the ride then silently
loses screen-off guidance. `components/FirstRun.js:65-67` explains When-In-Use but never mentions
background at all. Apple looks for in-app justification of `UIBackgroundModes: location`.

Add a small pre-permission sheet shown once before the Always request, explaining that Pedl needs
"Always" so spoken directions keep working with the phone in a pocket and the screen off, and that
without it nav only works with the screen on. Match the visual language of `components/FirstRun.js`
and the existing sheet components. Persist the "already shown" flag via `lib/storage.js` following
the existing key conventions — **do not rename any existing AsyncStorage key.** Handle denial
explicitly: continue with foreground-only nav and show a single unobtrusive notice, rather than
degrading silently.

**4. The BETA pill is the only path to the privacy policy (plan §2.4).**
The pill at `App.js:328-331` and `:341-344` is the sole entry point to `components/Feedback.js`,
which holds the only in-app Privacy Policy link a returning user can reach
(`Feedback.js:170-177`); the other is in `FirstRun.js:69-75`, shown once ever. Apple's 5.1.1(i)
requires an easily accessible in-app privacy link, so the pill can't just be deleted for 1.0.

Build a proper **About / Legal section in `components/SettingsSheet.js`** — currently just a title
and the "Unlock with" control at `:33-63`. It should contain: Privacy Policy link (`PRIVACY_URL`),
a Contact row using `CONTACT_EMAIL` from `lib/config.js` (currently exported but imported nowhere)
opening a `mailto:`, app version and build (reuse the pattern at `Feedback.js:16` and its
long-press build info), a data-attribution line, and the trademark disclaimer from item 5. Leave a
clearly-marked slot for a Terms link that renders only when `TERMS_URL` is non-empty — it's empty
today, so it should not render.

Then replace the two BETA pills with a neutral feedback affordance — a chat or question-mark icon
button, same tap target and placement, same `accessibilityLabel="Send feedback"`, opening the same
feedback sheet. Remove the BETA tag from `FirstRun.js:36` and the now-unused `betaPill`/`betaTxt`
styles. Keep the feedback sheet itself working exactly as it does.

**5. No trademark disclaimer anywhere (plan §2.5).**
Decision made: de-brand rather than seek permission. Citi Bike's data sharing policy grants a broad
license to use the data in a product but forbids using the CITI BIKE mark without written
permission and forbids implying affiliation.

Add this disclaimer to the new Settings About section, in small print:

> Pedl is an independent app. It is not affiliated with, endorsed by, or sponsored by Lyft Bikes and
> Scooters, LLC, Citigroup Inc., or the City of New York. Station data comes from the public GBFS feed.

Then reduce the hardcoded brand surface: `lib/systems.js:19` hardcodes `name: 'Citi Bike'` as the
display name. Prefer the operator name as supplied by GBFS `system_information.name` (check what
`lib/gbfs.js` already fetches — add it if it doesn't), falling back to the `systems.js` value only
when the feed doesn't provide one. Functional labels like "Unlock in Citi Bike" stay — that's
nominative use and it's what the feed says. Don't touch the `rental_uris` unlock logic.

---

When you're done: run `node --check` on every file you touched, and give me a summary that
separates **what you verified** from **what needs a device pass** (per CLAUDE.md — background
location, react-native-maps, and Google routing can't be tested here). List every file changed and
why. Do not commit; let me review the diff first.

> **Copy to here** ⬆

---

## Phase 2 — legal copy and user-facing text

Run after Phase 1 lands. This one produces text for you to paste onto pedlmaps.com; nothing here
ships in the binary except item 3.

> **Copy from here** ⬇

Read `docs/app-store-launch.md` §2.6 and §4 first.

**1. Rewrite the privacy policy.** Fetch the current one at https://pedlmaps.com/privacy.html.
Then audit the codebase for what the app *actually* collects and transmits — grep every `fetch`
call across `lib/` and `components/` and enumerate the destination hosts and payloads — and write
an updated policy that matches reality. It currently understates several things:

- The in-app feedback goes to a Discord webhook, and the **optional Name and Email fields**
  (`components/Feedback.js:152-153`) are transmitted with it and persisted locally
  (`:18-19`, `:93-94`).
- Google **Cloud Text-to-Speech** receives the spoken guidance lines, which contain the street
  names on the user's route (`lib/ttsGoogle.js`). The current policy mentions Google Maps Platform
  but not TTS.
- Sentry crash reporting, including what is now scrubbed after Phase 1.
- Apple's 5.1.1(i) requires an explicit **retention and deletion** section and how to revoke
  consent. Cover: local data is removed by deleting the app; feedback deletion by emailing
  `hello@pedlmaps.com`; location permission revocable in iOS Settings.
- Drop the TestFlight reference now that it's going to the App Store.

Write it as a complete HTML page matching the existing one's styling. Save it to
`docs/privacy-policy.html` in the repo — I'll upload it myself.

**2. Draft App Store listing copy.** Per §4.3, with the de-branding constraint from §2.5: **no
"Citi Bike" in the title, subtitle, keywords, or promotional text.** Describe it as NYC bike share.
Give me: app name (30 char max), subtitle (30), promotional text (170), full description (4000),
and a keyword list (100 chars total, comma-separated, no spaces). Include the independence
disclaimer at the end of the description. Save to `docs/app-store-listing.md`.

**3. Audit user-facing error copy** for anything that leaks internals. Specifically
`lib/routingGoogle.js` throws `json.error_message` verbatim from Google, which surfaces to users
via `components/TripScreen.js:351` and `:454-457` — so a quota problem shows the user "You have
exceeded your daily request quota for this API." Map Google's status codes to friendly copy
(`OVER_QUERY_LIMIT`, `REQUEST_DENIED`, `ZERO_RESULTS`, `NOT_FOUND`, network failure) while keeping
the raw message available under `__DEV__` for debugging. Also fix `App.js:456-460`, which renders
"No stations nearby / Try again in a moment" for what is usually a network failure on first load —
give it a distinct offline state with a retry button, using the existing error state set at
`App.js:191-197`. Both are JS-only; keep them OTA-safe.

Verify with `node --check`, summarize verified vs. needs-device-testing, and don't commit.

> **Copy to here** ⬆

---

## Phase 3 — you: screenshots and App Store Connect

Not a Claude Code job. From §4:

- **6.9" iPhone screenshots at 1320×2868**, 1–10 of them. This is the only required set once iPad
  is dropped in Phase 4. Suggested five: Nearby map with live stations → trip plan result → voice
  nav in progress → station sheet with the popular-times chart → saved places. **No Citi Bike marks
  visible in any frame.**
- App icon is already verified clean (1024×1024, no alpha) — nothing to do.
- Fill in the ASC listing from `docs/app-store-listing.md`, set category (Navigation), age rating
  4+, price free, support URL `pedlmaps.com`.
- **Privacy nutrition labels** — use the table in §4.4 verbatim. It must match the privacy policy
  from Phase 2 and the privacy manifest from Phase 4; mismatches between the three are a common
  rejection.
- **Review notes** — paste the four items from §4.5, especially the background-location
  justification and the independence statement. Don't skip these.

---

## Phase 4 — the one native build

Run after Phases 1–2 are merged and you've smoke-tested them via OTA on your current TestFlight
build.

> **Copy from here** ⬇

Read `docs/app-store-launch.md` §2.8, §3.2, §3.5, §3.6 and the "Shipping (OTA vs native build)"
section of `CLAUDE.md`.

This is the **single native build batch** before App Store submission — everything requiring a real
`eas build` goes in now, because native builds are the scarce resource on this project. Make all of
these changes, then stop before running the build.

**1. Drop iPad support.** Set `ios.supportsTablet: false` in `app.json`. Decision: the bottom-sheet
UI has never been tested on a 13" iPad, and keeping it would require an iPad screenshot set plus an
iPad review pass. Add a comment noting it's deliberate for v1.

**2. Fix the permission purpose strings.** The generated `Info.plist` currently carries Expo plugin
defaults that `app.json` doesn't override: `NSLocationAlwaysUsageDescription` = "Allow
$(PRODUCT_NAME) to access your location" and `NSMotionUsageDescription` = "Allow $(PRODUCT_NAME) to
detect your current motion activity". Apple rejects vague purpose strings. Override
`NSLocationAlwaysUsageDescription` in `app.json`'s `ios.infoPlist` to match the specific wording
already used for `NSLocationAlwaysAndWhenInUseUsageDescription`.

For `NSMotionUsageDescription`: first determine whether anything in this app actually uses motion
or pedometer APIs — grep the source and check which Expo plugin is injecting it. If nothing uses
it, remove the declaration rather than writing a purpose string for a permission we don't need.
Tell me which it is before changing it.

**3. Add a real privacy manifest.** `ios/…/PrivacyInfo.xcprivacy` is the Expo default with
`NSPrivacyCollectedDataTypes` empty, and `app.json` has no `ios.privacyManifests` key — so the
config plugin returns early and never merges anything. Add `ios.privacyManifests` to `app.json`
declaring what the app genuinely collects, matching §4.4 of the launch plan exactly:

- Precise Location — collected, not linked to identity, not used for tracking, App Functionality
- Contact Info (email, name) — collected, linked, not tracking, App Functionality / support
- User Content (feedback text) — collected, not linked, not tracking, App Functionality
- Crash Data — collected, not linked, not tracking, App Functionality

Look up the correct `NSPrivacyCollectedDataType*` constant strings from Apple's documentation
rather than guessing them — wrong constants fail validation at upload, which is a slow way to find
out. Also check whether any required-reason API declarations are needed for the SDKs in use.

**4. Re-enable Sentry source maps.** Both `eas.json` profiles set `SENTRY_DISABLE_AUTO_UPLOAD:
"true"` (added in `b80c55d` because the auth token 401'd). Without source maps every crash report
is minified and useless. Remove that env var from the **production** profile and document in
`eas.json` or `CLAUDE.md` that `SENTRY_AUTH_TOKEN` must be set as an EAS secret. Leave the preview
profile alone for now.

**5. Reconcile the version.** `app.json` says `1.0.1`, `package.json` says `1.0.0`, and
`components/Feedback.js:16` reads the `app.json` one. Set both to `1.0.0` for the store release and
say so in the summary.

Then **stop.** Do not run `eas build`. Give me: a diff summary, the exact build command to run, and
a numbered list of what I should verify on the resulting build before submitting — including the
two device tests still open in `TODO.md` (the nav-arrival `parked`/`passed` paths on real movement,
and the voice-nav device pass) plus cold launch with location denied, cold launch in airplane mode,
and tapping GO with location denied.

> **Copy to here** ⬆

---

## Appendix A — deferred by your call

Not in the prompts above. Each is a small add if you change your mind.

**Production OTA channel split** (plan §3.1). `eas.json`'s production profile uses
`channel: "preview"`, and `.github/workflows/eas-update.yml` publishes an EAS Update on *every*
push to `main`. Once you're live, an absent-minded push ships unreviewed code straight to App Store
users. I flagged this as the highest-consequence item on the should-fix list, and it's a ~10-line
change. To add it, append to the Phase 4 prompt:

> **6.** Give the production profile its own channel (`production`) separate from `preview`, and
> gate `.github/workflows/eas-update.yml` so it can only publish to `preview`. Document in
> `CLAUDE.md` how to deliberately publish an OTA update to store users.

The tradeoff is that store updates then need a deliberate publish rather than flowing from `main`.

**Terms page.** `TERMS_URL` stays `''`, so the Terms link never renders — Phase 1 item 4 leaves the
slot ready. Worth revisiting: you're giving turn-by-turn directions to cyclists, and a
ride-safely / obey-traffic-law clause is cheap insurance.

**Widget.** Branch stays unmerged for 1.1. When you do merge it, know that `.gitignore`'s `ios/`
line also matches `modules/widget-bridge/ios/`, so those Swift and podspec files are silently
untracked today and the branch would ship a broken native module.

## Appendix B — prompt-writing notes

If you adapt these: what makes them work is that each states the **symptom, the file:line, the
mechanism, and the constraint**, then asks for a summary separating verified from
needs-device-testing. The explicit "stop and tell me instead" escape hatches matter — without them,
a prompt that says "keep it OTA-safe" tends to get quietly violated when a fix looks like it needs
a native dep. The instruction not to commit keeps you in the loop on the diff.

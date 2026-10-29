# Pedl — App Store launch plan

Assessment date: **2026-08-19**. Scope: **iOS only**, v1.0. Last commit `b39f6fa` (2026-07-13).

---

## 1. Where you actually stand

**The app is done. The launch scaffolding isn't.**

Pedl is feature-complete and TestFlight-proven: live GBFS map, door-to-door trip planning,
voice nav with background location, saved places, favorites, popular-times chart, operator
deep-link unlock, first-run onboarding, Sentry wired, in-app feedback. ~6,400 lines across
`App.js` + `components/` + `lib/`. That is a shippable product.

What stands between you and the store is almost entirely **launch hygiene**: legal surfaces,
one real crash path, a privacy leak into Sentry, an unprimed background-location prompt,
API-key exposure, and the App Store Connect asset/metadata pile. None of it is hard. Most of
it is OTA-safe, meaning no new native build.

Good news up front, so you can stop worrying about them:

- **SDK requirement: you're clear.** Since 2026-04-28 App Store Connect requires Xcode 26 /
  iOS 26 SDK. Expo SDK 54+ builds on Xcode 26 by default on EAS; you're on **SDK 56**.
  No upgrade needed.
- **No committed `ios/` to fight.** Managed/CNG — EAS regenerates from `app.json` every build.
- **Export compliance already answered.** `ITSAppUsesNonExemptEncryption: false` is set.
- **No accounts** → no demo-account requirement, no in-app account-deletion requirement.
- **Privacy policy already exists and is real** at `pedlmaps.com/privacy.html`, and it's a
  decent one. It needs an update (see §2.6) but it's not a from-scratch job.
- **You have an Apple Developer account and an ASC record** — TestFlight builds prove it.

Realistic estimate: **1–2 focused sessions of code work, plus your time on assets and
listing copy.** The critical path is the native build + review turnaround, not the coding.

---

## 2. Blockers — must be fixed before you hit Submit

### 2.1 Nav can silently brick if location permission was denied
`components/NavScreen.js:189` calls `nav.start({...})` with **no `await` and no `.catch()`**
inside a `useEffect`. `lib/voiceNav.js:334` throws `Location permission needed for navigation.`
when foreground permission isn't granted, and `startLocationUpdatesAsync` (`:345`) can reject
too. Result: unhandled rejection, `_ready` never set, the nav screen renders a frozen banner,
no guidance, **no error shown to the user**.

This is reachable in production — a user who declined location on the Nearby screen can still
plan a trip (the app falls back to Midtown) and tap GO. An App Review tester who taps "Don't
Allow" out of habit will land exactly here. This is a classic Guideline 2.1 rejection.

**Fix:** `await`/`catch` the start, surface a real error state with a "Enable location"
→ `Linking.openSettings()` action, and bail out of nav cleanly. OTA-safe.

### 2.2 Sentry is shipping the user's precise location and your Google API key
Sentry's default `breadcrumbsIntegration` records XHR/fetch URLs, and RN's `fetch` runs on
XHR. Every routing call gets breadcrumbed onto error events:

- `lib/routingGoogle.js:75` — `distancematrix/json?origins=<lat,lng>&destinations=…&key=<KEY>`
- `lib/routingGoogle.js:107` — `directions/json?origin=<lat,lng>&destination=<lat,lng>&key=…`
- `lib/routingGoogle.js:51` — `geocode/json?address=<what the user typed>&key=…`
- `lib/ttsGoogle.js:72` — `text:synthesize?key=<KEY>`

`tracesSampleRate: 0.2` (`App.js:41`) creates HTTP spans carrying the same URLs. So precise
user coordinates and your billable API key land in a third-party service. Your privacy policy
says diagnostics are collected "without personal identification" — today that isn't true.

**Fix:** add a `beforeSend` / `beforeBreadcrumb` in `App.js:37-43` that strips query strings
from `maps.googleapis.com`, `places.googleapis.com`, and `texttospeech.googleapis.com` URLs
(keep the path, drop everything after `?`). Consider dropping `tracesSampleRate` to 0 for v1 —
you don't need perf traces on day one. OTA-safe.

### 2.3 Background "Always" location is requested with zero priming
`lib/voiceNav.js:344` fires `requestBackgroundPermissionsAsync()` inside a bare
`try { } catch {}` — mid-flow, immediately after the user taps GO, with no explanation screen
and no handling of a denial (the ride then silently loses screen-off guidance).

`components/FirstRun.js` explains *When In Use* ("Pedl uses your location to show nearby
stations and guide you while riding", `:65-67`) but **never mentions background/Always at all**.

Apple reviewers specifically look for in-app justification of `UIBackgroundModes: location`
(Guideline 2.5.4). Unprimed Always prompts are a common rejection.

**Fix:** a small pre-permission sheet before the Always request, shown once — "Pedl needs
'Always' so voice directions keep working with your phone in your pocket. Without it, nav only
works with the screen on." Plus handle the denial path (fall back to foreground-only nav with
a one-line notice rather than degrading silently). OTA-safe.

Also worth pre-empting: you declare **`UIBackgroundModes: ["location", "audio"]`**. The `audio`
mode is a frequent 2.5.4 flag when the app isn't an audio app. Yours is defensible (spoken
guidance with screen off) but say so explicitly in the review notes (§4.4).

### 2.4 The only path to your legal links is the BETA pill
The BETA pill (`App.js:328-331`, `:341-344`) is the **sole entry point** to `Feedback.js`, which
holds the **only in-app Privacy Policy link** for a returning user (`Feedback.js:170-177`). The
other link is in `FirstRun.js:69-75`, which shows exactly once, ever.

Guideline 5.1.1(i) requires a privacy policy link **inside the app, easily accessible**. If you
strip the BETA pill for launch, you delete your only compliant path. If you keep it, you're
shipping a "BETA" badge on a 1.0.

**Fix:** build a proper **About / Legal section in `components/SettingsSheet.js`** (currently
just a title + the "Unlock with" control, `:33-63`). It should carry: Privacy Policy, Terms,
Contact, version + build, data attribution, and the trademark disclaimer (§2.5). Then re-skin
the BETA pill as a neutral feedback affordance (a chat or "?" icon) and keep the feedback sheet.
OTA-safe.

### 2.5 Citi Bike / Lyft trademark exposure — you chose the safe path
Citi Bike's [Data Sharing Policy](https://citibikenyc.com/data-sharing-policy) grants a
generous data license ("distribute in your product or service and use the Data for any lawful
purpose") but explicitly prohibits:

> 7. "State or imply that you are affiliated, approved, endorsed, or sponsored by Bikeshare"
> 8. Use of trademarks without written permission, including "CITI BIKE, and the CITI BIKE logo"

Apple Guideline 5.2.1 also requires you hold rights to the content and marks you use. Unofficial
clients of branded services do get rejected on this.

Today there is **no disclaimer anywhere in the app**, while it displays the Citi Bike name
(`lib/systems.js:19`), links to the Citi Bike App Store page (`:26`), deep-links to Lyft (`:25`),
and shows hardcoded Citi Bike fare rates (`lib/config.js:114-123`).

**Fix (de-brand + disclaimer):**
- **Keep** the app name "Pedl" — already unbranded. Keep the icon unbranded.
- **App Store listing:** no "Citi Bike" in the title, subtitle, icon, or screenshots. Describe
  it as "NYC bike share." Leave Citi Bike out of the keyword field too — technically Apple
  permits competitor keywords, but the data policy's trademark clause doesn't, and it's the
  single most likely thing to trip a 5.2.1 review.
- **In-app:** the operator name where it's functionally necessary ("Unlock in Citi Bike") is
  nominative use and hard to avoid — that's fine. Prefer sourcing it from GBFS
  `system_information.name` rather than the hardcode at `systems.js:19`, so it's factually
  "what the feed says," not your branding.
- **Add the disclaimer** to the Settings About section and the store description:
  *"Pedl is an independent app. It is not affiliated with, endorsed by, or sponsored by Lyft
  Bikes and Scooters, LLC, Citigroup Inc., or the City of New York. Station data comes from the
  public GBFS feed."*
- **Update pedlmaps.com** — the homepage currently reads "designed specifically for Citi Bike
  riders," which is exactly the trademark use you're removing from the app.
- **Fares:** keep the "estimate" framing and add the disclaimer + `asOf` date visibly in the UI,
  not just in a code comment.

### 2.6 Privacy policy needs to match what the app actually does
The policy at `pedlmaps.com/privacy.html` (updated 2026-06-24) is solid but now understates
things. Guideline 5.1.1(i) requires it to identify **all** data collected, **all** uses, and
**retention/deletion + how to revoke consent**.

Update it to cover:
- The Discord feedback channel by name, and that the **optional name/email fields**
  (`Feedback.js:152-153`) are transmitted and stored in AsyncStorage (`:18-19`).
- Sentry crash data — and what you now scrub (§2.2).
- Google Cloud Text-to-Speech (your route's street names are sent to Google) — the current
  policy lists Google Maps Platform but not TTS specifically.
- A concrete retention/deletion paragraph: local data is deleted by deleting the app; feedback
  deletion by emailing `hello@pedlmaps.com`.
- Drop the TestFlight mention once you're on the store.

Also: set `TERMS_URL` (`lib/config.js:25`, currently `''`, so the Terms link never renders at
`FirstRun.js:76-81`) and host a short terms page. Not strictly required by Apple, but you're
giving navigation directions to cyclists — a liability/"ride safely, obey traffic law" clause
is worth having.

### 2.7 Google API key: one unrestricted key across five APIs
`GOOGLE_API_KEY` (`lib/config.js:16`) is an `EXPO_PUBLIC_` var, so it is **extractable from the
shipped bundle**. It currently serves:

| API | Host |
|---|---|
| Directions | `maps.googleapis.com/maps/api/directions/json` |
| Distance Matrix | `maps.googleapis.com/maps/api/distancematrix/json` |
| Geocoding | `maps.googleapis.com/maps/api/geocode/json` |
| Places (New) — autocomplete + details | `places.googleapis.com/v1/…` |
| **Cloud Text-to-Speech** | `texttospeech.googleapis.com/v1/text:synthesize` |

**Correction (2026-08-19), important:** an earlier draft of this section said the Maps APIs
accept an iOS-bundle-ID restriction as-is. That is wrong in a way that would break the app.
The **`iOS apps` application restriction is designed for the iOS SDKs** (Maps SDK for iOS,
Places SDK for iOS). Pedl doesn't use those — it calls the **web service** APIs over plain
`fetch`. Per [Google's Maps Platform security guidance](https://developers.google.com/maps/api-security-best-practices),
a client app calling web services directly must send the **`X-Ios-Bundle-Identifier` HTTP
header** for that restriction to be satisfied; Google's primary recommendation for web
services is otherwise an IP restriction or a proxy. Pedl sends no such header today, so
applying the restriction first would make every routing, geocoding, and Places call start
returning `REQUEST_DENIED` on the live TestFlight build.

And **Cloud Text-to-Speech isn't Maps Platform at all**, so it has no bundle-header path —
API restriction is the only lever there.

**Fix before launch, in this order:**
1. **Code first (OTA):** add `X-Ios-Bundle-Identifier: com.dylanglatt.citibike` to the fetches
   in `lib/routingGoogle.js` (:51, :75, :107) and `lib/places.js` (:18, :45 — that file already
   sends headers, so it's trivial there). Separately, add a `GOOGLE_TTS_KEY` to `lib/config.js`
   and switch `lib/ttsGoogle.js:6` off the shared `GOOGLE_API_KEY`.
2. Create the two keys **unrestricted**, wire them up, ship OTA, and confirm on device that
   trip planning and voice both still work.
3. **Only then** apply restrictions: Key A → iOS apps + bundle ID, restricted to Directions,
   Distance Matrix, Geocoding, Places API (New). Key B → no application restriction possible,
   API-restricted to Cloud Text-to-Speech **only**, so an extracted key can't reach Maps.
4. **Lower the TTS quota override** (default Neural2 is 1,000 req/min/project — nothing you do
   needs that). This is your real abuse ceiling, because GCP's spend-cap budgets don't cover
   TTS or Maps; there you get alerts, not a hard stop. Set budget alerts anyway.
3. Consider whether v1 needs Google TTS at all. `voiceNav.js` already falls back to on-device
   `expo-speech`. Shipping v1 on-device-only removes the exposed-billable-key problem entirely
   and works offline; you can re-enable Neural2 once you see real usage. Your call — it's a
   real quality downgrade, which is why you chose Neural2 in the first place.
4. `README.md:50-53` still says to restrict to three APIs — stale, update it.

### 2.8 Decide iPad now
`app.json` sets `ios.supportsTablet: true`. That means Apple **requires 13" iPad screenshots**
(2064×2752) and a reviewer will run it on an iPad. Nothing in the app has been iPad-tested; a
phone-shaped bottom-sheet layout on a 13" screen is a Guideline 4.0/2.1 risk.

**Recommendation: set `supportsTablet: false` for v1.** It removes an entire screenshot set and
a whole class of layout bugs. Add iPad back deliberately later. This is a **native change** —
batch it (§5).

---

## 3. Should-fix — not rejection-level, but you'll regret skipping them

| # | Item | Where | Why |
|---|---|---|---|
| 3.1 | **Store build shares the OTA channel with TestFlight** | `eas.json` `production` → `channel: "preview"`; `.github/workflows/eas-update.yml` publishes on **every push to main** | Any accidental push to `main` ships straight to live App Store users, unreviewed. Give production its own channel, or gate the workflow. **The single highest-consequence item on this list.** |
| 3.2 | **Sentry source maps disabled** | `eas.json` both profiles set `SENTRY_DISABLE_AUTO_UPLOAD: "true"` (from `b80c55d`, a 401 token) | Every crash report arrives minified and useless. Fix the auth token and re-enable — otherwise crash reporting is theater. |
| 3.3 | **Google errors shown verbatim to users** | `routingGoogle.js` throws `json.error_message`; rendered at `TripScreen.js:351, 454-457` | Users see "You have exceeded your daily request quota for this API." Map to friendly copy. |
| 3.4 | **First-load network failure looks like "no stations"** | `App.js:456-460` renders "No stations nearby" with no retry button or pull-to-refresh | Reviewers on flaky wifi see an empty app. Add a distinct offline state + retry. |
| 3.5 | **Generic permission strings leak into Info.plist** | Plugin defaults `NSLocationAlwaysUsageDescription` = "Allow $(PRODUCT_NAME) to access your location", `NSMotionUsageDescription` = "…detect your current motion activity" — not overridden in `app.json` | Apple rejects vague purpose strings. Override both. Also: why is Motion declared at all? Remove it if unused. **Native change.** |
| 3.6 | **Privacy manifest is empty** | `ios/…/PrivacyInfo.xcprivacy` has `NSPrivacyCollectedDataTypes` empty; no `ios.privacyManifests` in `app.json` so the plugin never merges anything | Should declare precise location + crash data + contact info. Must match your ASC nutrition labels. **Native change.** |
| 3.7 | **"Stop dwell" is a visible dead feature** | `TODO.md`: the multi-stop cue says "tap when ready to continue" but nothing gates on the tap | Shipped, user-visible, non-functional. Either wire it or change the copy. |
| 3.8 | **Feedback webhook is extractable** | `EXPO_PUBLIC_FEEDBACK_WEBHOOK`, POST at `Feedback.js:86` | Anyone can spam or nuke your Discord channel. Low stakes at your volume; a tiny relay endpoint fixes it if it becomes a problem. |
| 3.9 | **~3.5 MB of JSON in the bundle** | `lib/availability.json` (2.1 MB) + `lib/reliability.json` (1.4 MB) | Both are live and used. Affects download size and cold start. Not urgent; worth measuring. |
| 3.10 | **Version skew** | `app.json` `1.0.1` vs `package.json` `1.0.0` | `Feedback.js:16` reads `app.json`. Reconcile so build info is honest. |
| 3.11 | **Dead code shipping** | `choosePredicted`/`planTrip({predicted})` (`tripPlanner.js:43,107-112,174`) never called; `loadSaved`/`saveSaved` (`storage.js:5-23`) superseded; `navSim.js` bundled (`__DEV__`-gated UI) | Harmless, but tidy before 1.0 or leave a comment saying it's parked. |
| 3.12 | **Uncommitted work in the tree** | `App.js` (removes "Use Lyft instead" link) + `lib/systems.js` (Lyft link → `/lastmile_qr_scan`) | Commit or revert before you start launch work, so the baseline is clean. |
| 3.13 | **`widget` branch has a gitignore trap** | `.gitignore:9` `ios/` also matches `modules/widget-bridge/ios/`, so those Swift/podspec files are silently untracked | Not a v1 item — but if you merge that branch later it will ship broken. Note it now. |

---

## 4. App Store Connect — the asset and metadata pile

This is the part that isn't code, and it's usually what actually delays launch.

### 4.1 Screenshots (required)
- **6.9" iPhone: 1320×2868** (1290×2796 or 1260×2736 also accepted). 1–10 images. **Required.**
- **13" iPad: 2064×2752** — required **only if** `supportsTablet` stays `true`. See §2.8.
- Everything else is optional; Apple scales down.
- Content rules: no Citi Bike marks visible in the frames (§2.5). Use the simulator or a real
  device; a status-bar-clean capture looks better.
- Suggested five: Nearby map with live stations → trip plan result → voice nav in progress →
  station sheet with the popular-times chart → saved places.

### 4.2 Other assets
- **App icon 1024×1024**, no alpha channel, no rounded corners. ✅ **Verified clean** —
  `assets/icon.png` is 1024×1024, PNG color type 2 (RGB, no alpha), no `tRNS` chunk.
- Optional but high-value: a 15–30 s **app preview video** of a nav run.

### 4.3 Listing copy to write
Name (30), subtitle (30), promotional text (170), description (4000), keywords (100),
support URL, marketing URL, privacy policy URL, category (Navigation or Travel), age rating
questionnaire, copyright line. All with the de-branding constraint from §2.5.

### 4.4 Privacy nutrition labels — declare honestly
Based on what the code actually does:

| Data type | Collected? | Linked to identity? | Used for tracking? | Purpose |
|---|---|---|---|---|
| Precise Location | **Yes** | No | No | App Functionality |
| Contact Info (email/name) | **Yes** — optional feedback fields | Yes | No | App Functionality / Developer support |
| User Content (feedback text) | **Yes** | No | No | App Functionality |
| Diagnostics (crash data) | **Yes** | No | No | App Functionality |

Nothing is used for tracking, nothing is sold. Keep this consistent with `PrivacyInfo.xcprivacy`
(§3.6) and the privacy policy (§2.6) — mismatches between the three is a common rejection.

### 4.5 Review notes — write these, they matter
Include verbatim-ish:
1. **Why background location:** "Pedl provides spoken turn-by-turn navigation for cyclists. The
   `location` background mode keeps guidance running with the phone in a pocket and the screen
   off — the core use case, since riders cannot look at a screen. The `audio` mode is used to
   speak directions over the lock screen and through headphones. To test: plan a trip, tap GO,
   lock the phone — spoken directions continue."
2. **Independence:** "Pedl is an independent app not affiliated with Lyft or Citigroup. Station
   data comes from the publicly published GBFS feed under Citi Bike's data sharing policy
   (https://citibikenyc.com/data-sharing-policy). The 'unlock a bike' action hands off to the
   operator's own app via the `rental_uris` deep link supplied by that feed; Pedl does not
   rent, unlock, or bill for bikes."
3. **No account needed** — the app is fully usable without sign-in.
4. **Test tip:** "Please allow location when prompted; the app is NYC-only, so set the simulator
   location to New York, NY."

### 4.6 Also
- **Age rating:** 4+ is right.
- **Price:** free.
- **Export compliance:** already declared in `app.json`.
- Set an ASC support URL that resolves (`pedlmaps.com` works).

---

## 5. Suggested sequence

Native builds are your scarce resource, so batch them. Everything marked OTA can ship
continuously without a build.

**Phase 1 — clean baseline (30 min)**
Commit or revert the working-tree changes (§3.12). Split the Google keys and set the billing
cap (§2.7) — do this first, it's independent of everything else and protects you immediately.

**Phase 2 — OTA blockers (one session)**
§2.1 nav crash path · §2.2 Sentry scrubbing · §2.3 background-location priming · §2.4 Settings
About/Legal section + re-skinned feedback affordance · §2.5 in-app disclaimer + GBFS-sourced
operator name · §3.3 friendly routing errors · §3.4 offline state · §3.10 version reconcile.
Push to `main`, verify on the current TestFlight build via OTA.

**Phase 3 — content you write (parallel, your time not mine)**
Privacy policy update (§2.6) · terms page · pedlmaps.com de-brand · screenshots (§4.1) ·
listing copy (§4.3).

**Phase 4 — the ONE native build**
Bundle every native change into a single `eas build`: `supportsTablet: false` (§2.8) ·
permission strings (§3.5) · privacy manifest (§3.6) · Sentry source-map token re-enabled (§3.2)
· production OTA channel split (§3.1) · version bump to 1.0.0.

**Phase 5 — device pass before submit**
Two outstanding device tests from `TODO.md` that were never done: the **nav arrival**
`parked`/`passed` paths on real movement, and the **voice-nav device pass** (voice selection,
reroute on a real ride). Add: cold launch with location denied, cold launch with airplane mode,
tap GO with location denied, iPhone-only layout check.

**Phase 6 — submit**
TestFlight the release candidate, then submit with the review notes from §4.5.

---

## 6. Decisions I need from you

1. **Google TTS in v1?** (§2.7) — keep Neural2 with an exposed billable key + budget cap, or
   ship on-device voice for 1.0 and re-enable later? Quality vs. exposure.
2. **iPad: drop it for v1?** (§2.8) — I recommend yes.
3. **Production OTA channel** (§3.1) — split it from `preview` so a push to `main` can't reach
   store users? I recommend yes, though it means store updates need a deliberate publish.
4. **Terms page** — want one? I'd draft it, but it's your liability call for a nav app.
5. **Do you want the widget in v1?** (branch `widget`, unmerged, has the gitignore trap in
   §3.13) — I'd say no. Ship 1.0, add the widget in 1.1.

---

## 7. Things that are explicitly NOT blockers

Worth naming so you don't spend time on them:

- The dormant prediction code (`choosePredicted`, `projectStation`) — parked, not shipped in
  any user path. Leave it.
- Snapshot collection on the droplet — running fine, feeds a future feature, irrelevant to launch.
- Empty-recall weakness in the reliability model — the "avoid empty stations" direction is not
  user-facing.
- The absence of a test framework — real technical debt, not a launch gate.
- Android — deferred by your own scope decision.

---

**Sources:** [Apple upcoming SDK requirements](https://www.developer.apple.com/news/upcoming-requirements/) ·
[Expo: App Store Connect minimum SDK 26](https://expo.dev/blog/app-store-connect-minimum-sdk-26) ·
[App Store screenshot sizes 2026](https://screenkit.tools/specs/app-store-screenshot-sizes) ·
[App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) ·
[Citi Bike Data Sharing Policy](https://citibikenyc.com/data-sharing-policy)

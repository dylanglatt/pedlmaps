# Pedl launch fixes: Claude Code prompt pack (Nov 2026)

Source: two independent pre-launch reviews (Sonnet and Codex, 2026-11-04). This supersedes the
code phases of `claude-code-launch-prompts.md`, with one changed decision: **the production OTA
channel split is now IN** (both reviewers flagged it).

How to run: one prompt per fresh Claude Code session, from the repo root, in order. Review the
diff between prompts. Prompts 1 to 5 are JS-only (OTA-safe). Prompt 6 is the native build config.
Every prompt commits but does NOT push; push yourself (or `/ship`) once you've read the diff.

---

## Prompt 1: CI hardening (do first, 10 min)

```
Read CLAUDE.md first. Fix .github/workflows/eas-update.yml:

1. Shell injection: the "Publish update" step interpolates ${{ github.event.head_commit.message }}
   directly into the shell command while EXPO_TOKEN is loaded. Move it into an env var
   (e.g. UPDATE_MESSAGE) and pass "$UPDATE_MESSAGE" quoted. Truncate to the first line.
2. Add a concurrency group (one group per branch, cancel-in-progress: true) so two quick pushes
   can't publish an older commit last.
3. Add a cheap gate before publishing: `node --check` on every .js/.mjs file under App.js,
   components/, lib/ (not node_modules) and `npx expo export --platform ios --output-dir /tmp/x`
   or equivalent bundling check, so a syntax/import error fails CI instead of shipping.
   If expo export is too slow or needs secrets, skip it and say so.

Do not change the branch/channel it publishes to (that's a later prompt). Validate the YAML
parses (e.g. python -c "import yaml,sys;yaml.safe_load(open(sys.argv[1]))" <file>).
Commit with a clear message. No Co-Authored-By or "Generated with" trailers. Don't push.
```

---

## Prompt 2: Navigation failure paths

```
Read CLAUDE.md first. Fix these navigation bugs. All JS-only. Verified file:line refs from review:

1. Nav start dead-ends. components/NavScreen.js (~line 193) calls nav.start({...}) in a mount
   effect without await/catch. lib/voiceNav.js start() (~305) marks nav active before permission
   checks, then throws at ~337 if foreground permission is denied, and startLocationUpdatesAsync
   (~348) can reject. Fix: in start(), only set active after permission + task start succeed, and
   clean up on failure. In NavScreen, catch the rejection, call nav.stop(), close the nav screen
   (onEnd), and show an Alert explaining location is needed with an "Open Settings" button
   (Linking.openSettings()) and "Cancel".

2. "Always" location pre-prompt. voiceNav.js (~347) calls requestBackgroundPermissionsAsync()
   with no context, swallowed in try {} catch {}. Before requesting it (only when status is not
   already granted and we haven't asked before; persist that in AsyncStorage under a NEW key,
   never rename existing dockhop.* keys), show a short explainer: "Pedl uses Always location so
   directions keep speaking with your screen off." with Continue / Not now. If denied, nav still
   runs foreground-only; show a one-line notice in the nav banner area that guidance stops when
   the screen locks.

3. Voice must never go silent. voiceNav.js resolves googleOk from key presence only (~318) and
   when Google TTS synthesis fails after retries it skips the cue silently (~280-297). Change the
   policy: if a Google cue can't be synthesized, speak that cue with expo-speech on-device instead.
   Also preflight one real synthesis at GO; if it fails, lock the route to on-device voice.
   Also check _warmCache (~297): it caches raw maneuver instructions but the advance cues spoken
   later (~649) are generated text, so they miss the cache. Cache the strings actually spoken.
   Update the code comments that say "never switch voices" to match the new policy.

4. Reroute drops dock metadata. components/NavScreen.js (~149) rebuilds waypoints as
   { instruction, location, distance: 0, kind }, dropping station and seg, which voiceNav.js
   (~462) needs to watch the destination dock. Preserve the original waypoint ({ ...wp, distance: 0 }).

5. Multi-stop: components/TripScreen.js (~79) says "Tap when ready to continue" but voiceNav.js
   (~622) auto-advances and there is no control. Remove the "tap" wording so the cue matches
   behavior (auto-continue). Don't build a pause state.

Verify: node --check every touched file; write a throwaway node script (see the existing
test_nav.mjs / test_reroute.mjs for how to stub expo modules) that exercises start() failure
cleanup and the reroute waypoint preservation; run it, then delete it unless it's worth keeping
next to the others. Be explicit in your summary about what still needs a device pass (all of
1-3 do). Commit with a clear message, no Claude trailers. Don't push.
```

---

## Prompt 3: Planner, location, network

```
Read CLAUDE.md first (and /planner-test). All JS-only.

1. Same-station trips. lib/tripPlanner.js (~146) scores every origin/dest pair, including a
   station paired with itself. Exclude pairs where originStation.id === destStation.id, and drop
   bike legs under a minimum ride distance (add a tunable in lib/config.js, default ~400 m). If no
   bike plan survives because the endpoints are close, return a walk-only result that TripScreen
   shows as "Walking is faster" (reuse existing UI patterns; keep it minimal).

2. Planner race. components/TripScreen.js (~135) has no request generation/cancellation and sets
   plan before route, so quick toggles of Any/Classic/E-bike (~234) can pair plan B with route A.
   Add a request id ref; commit plan + route together only if still current. Same treatment for
   autocomplete (~124): ignore stale responses and clear pending timers on unmount.

3. Fake "My Location". lib/location.js (~32) falls back to Midtown when permission is denied;
   TripScreen (~117) labels that "My Location". Make getLocation return a flag (e.g. isFallback)
   and when true: don't label it My Location, require the user to enter a start address, and show
   a small "Location off" hint with an Open Settings action. The Nearby map may still center on
   Midtown.

4. Out of service area. lib/gbfs.js (~81) returns up to 75 stations with no distance cap, so
   App.js (~250) labels far-away NYC stations "NEARBY" for users anywhere. Add a max distance
   tunable (e.g. 3 km) for the Nearby list; if the user is farther than that from every station,
   show "You're outside the Citi Bike service area" instead of the list, and don't offer unlock.

5. Network timeouts and offline. No fetch has a timeout (lib/gbfs.js ~14, lib/routingGoogle.js
   ~75, lib/places.js ~18, lib/ttsGoogle.js ~72). Add a small fetchWithTimeout helper (AbortController,
   ~10 s default, tunable in config) and use it everywhere. App.js (~211) waits on station refresh
   before hiding the splash: hide it after a bounded wait regardless. App.js (~456) shows
   "No stations nearby" on a network failure: distinguish failure ("Can't reach Citi Bike, retry")
   with a Retry button. Cache the last good station feed in AsyncStorage (new key) and show it
   with a "last updated" note when offline.

Verify with throwaway node scripts that import tripPlanner (same-station exclusion, min distance,
walk-only result, identical endpoints) and fetchWithTimeout (aborts). node --check all touched
files. List what needs device testing. Commit, no Claude trailers. Don't push.
```

---

## Prompt 4: Privacy, branding, review polish

```
Read CLAUDE.md first. All JS-only.

1. Sentry PII. App.js (~37-43) inits Sentry with no scrubbing and tracesSampleRate 0.2. Request
   URLs to googleapis.com carry lat/lng, typed addresses and ?key=. Add beforeBreadcrumb and
   beforeSend that strip query strings from any URL (breadcrumb data.url, request.url, span
   descriptions) and drop the X-Goog-Api-Key header if present. Set tracesSampleRate to 0 (or
   strip URLs from spans too via beforeSendTransaction). Also set sendDefaultPii: false explicitly.
   Write a throwaway node test that runs the scrub functions on sample breadcrumbs.

2. Remove BETA. App.js (~328, ~341) BETA pills and components/FirstRun.js (~35) "Welcome to Pedl
   BETA". Replace the header pill with a small "Feedback" affordance that opens the same sheet.
   Hide the build/runtime/update-id debug info in components/Feedback.js (~50) unless __DEV__.

3. Settings: About section. components/SettingsSheet.js has no legal entries. Add: Privacy Policy
   (https://pedlmaps.com/privacy.html), a line "Pedl is an independent app, not affiliated with
   Citi Bike, Lyft, or Citibank.", "Station data: Citi Bike GBFS feed (open data).", and app version.

4. Debug flags. Guard NAV.debugFakeFullDock and DEBUG_TEST_CRASH in lib/config.js so they can only
   be true when __DEV__ (e.g. `debugFakeFullDock: __DEV__ && false`).

5. Fares. lib/config.js FARES gives non-members 45 included classic minutes. Check current pricing
   on citibikenyc.com/pricing. If non-member single rides include 30 minutes, fix it and update
   asOf. If you can't reach the page, leave the value and tell me.

6. Privacy policy text. The site pedlmaps.com is probably not in this repo; if it is, update it.
   Either way, write docs/privacy-policy-update.md with the exact text changes needed: name
   Discord as the feedback processor and list every field Feedback.js sends (message, optional
   name/email, screen, app/runtime/update ids, platform, OS version); say Sentry receives crash
   diagnostics with URLs scrubbed; say location and searched addresses are sent to Google to
   compute routes and are not stored by Pedl; retention and deletion contact. Also list the App
   Store Connect "App Privacy" answers this implies (data type, linked to user?, tracking?).

node --check touched files. Commit, no Claude trailers. Don't push.
```

---

## Prompt 5: Google key header + TTS key split

Use **Phase 0.2** in `docs/claude-code-launch-prompts.md` as written (adds
`X-Ios-Bundle-Identifier` to Maps web-service calls, moves TTS to `EXPO_PUBLIC_GOOGLE_TTS_KEY`).
Paste it into a fresh session. Then do Phase 0.3 to 0.6 yourself in Google Cloud (create keys,
ship, device-verify, THEN restrict and cap). Rotate the Discord webhook and ORS key at the same time.

---

## Prompt 6: Native build config (last)

```
Read CLAUDE.md first. This is the native-build change set for App Store submission. Do NOT run
eas build, eas submit, or eas update; print the commands for me instead.

1. Production OTA channel. eas.json production profile uses channel "preview" + environment
   "preview", and CI publishes every push to main to preview, so store users get every push.
   Change production to channel "production" and environment "production". Keep CI publishing to
   preview (TestFlight/internal). Add a manual workflow (.github/workflows/eas-promote.yml,
   workflow_dispatch) that republishes the latest preview update to production
   (eas update:republish --source-branch preview --destination-branch production, or the current
   eas-cli equivalent; check `npx eas-cli update:republish --help`). Use the same env-var pattern
   for any user-supplied text as the fixed eas-update.yml.
   List exactly which EAS env vars I must copy from the preview to the production environment
   (read lib/config.js and .env.example for the names) and the eas env commands to do it.

2. runtimeVersion. app.json uses the fixed string "3". Switch to { "policy": "appVersion" } so a
   new native version can't receive JS built for the old one. Explain the impact on existing
   TestFlight installs in one sentence.

3. iPad. Set ios.supportsTablet to false for v1.

4. Sentry source maps. eas.json sets SENTRY_DISABLE_AUTO_UPLOAD=true in both profiles because the
   auth token 401'd (see TODO.md). Leave it unless I tell you the token is regenerated; tell me
   the steps to validate it.

5. Bump expo.version in app.json to 1.1.0 (store version for first public release).

Update CLAUDE.md "Shipping" section and TODO.md to reflect the new channel setup. Commit, no
Claude trailers. Don't push. Finish with the exact command sequence: copy env vars, push, build
(eas build --profile production --platform ios), submit (eas submit --platform ios --latest).
```

---

## You (not Claude Code)

- Google Cloud: key split, restrictions, quotas, billing alert (Prompt 5).
- Rotate Discord webhook + ORS key; update `.env` and EAS env.
- Update the live privacy policy from `docs/privacy-policy-update.md`.
- Copy EAS env vars to the production environment (Prompt 6 lists them).
- Device pass on the new TestFlight build: deny location then GO; deny Always; airplane mode at
  launch and mid-route; a real ride with a reroute; a stop short of the dock (TODO.md nav test).
- App Store Connect: 6.9" screenshots, subtitle/description (say "unofficial", no "Citi Bike" in
  the app name or keywords), privacy answers, age rating, review notes ("NYC only; sample
  addresses: ..."; explain Always location + audio background modes).
- Before submitting: rerun the Codex review prompt on the final commit.

# pedl — backlog

Outstanding work, roughly in priority order. (Captured 2026-06-23 when moving the build
workflow to Claude Code.)

## Finish the nav fix (in progress)

- [ ] **Real-movement device test.** The teleport smoke test proved the `radius` path. The
      `parked` (stop-short) and `passed` (rolled-past) paths only appear with actual motion.
      Run one GPX route that ends ~30 m short of the dock to confirm both. This is the last gap
      before trusting it on a real ride.
- [ ] **Decide on `[nav]` logging.** It's `__DEV__`-gated so harmless in prod — leave it or
      strip it once confident.

## Voice (deferred threads — original complaints)

- [x] **Better voice.** `voiceNav.js` now resolves the best installed en-US voice (Enhanced/
      premium if downloaded, else system default) once per session and speaks at rate 0.95
      (`VOICE` in `lib/config.js`). Needs a device pass to confirm the enhanced voice is picked.
- [x] **Cleaner phrasing.** `lib/navPhrasing.js` — `phrase()` expands street abbreviations
      (St→Street, with St→Saint for leading names) + trims provider verbosity; applied in
      `routingGoogle.js`/`routingOrs.js`. `arrivalLine()` names the place ("You've arrived at
      Life Time"), wired into `TripScreen` (dest waypoint) + `NavScreen` (banner).

## Nav loose end

- [ ] **Stop dwell.** The multi-stop cue says "tap when ready to continue" but nothing gates on
      the tap yet. Only matters once intermediate stops are in use.

## Beta basics (from roadmap, unrelated to nav)

- [~] **Crash reporting** — Sentry. Code wired (App.js init + Sentry.wrap + ErrorBoundary,
      `@sentry/react-native` dep, `metro.config.js`, `@sentry/react-native/expo` plugin in
      app.json, `SENTRY_DSN` in config). REMAINING: (1) `npx expo install @sentry/react-native`
      to lock the SDK-correct version; (2) create Sentry org/project, paste org slug into the
      app.json plugin; (3) set `EXPO_PUBLIC_SENTRY_DSN` in `.env` + EAS preview env; (4) set
      `SENTRY_AUTH_TOKEN` as an EAS secret (source-map upload); (5) native `eas build`.
- [ ] **Feedback webhook** — set `EXPO_PUBLIC_FEEDBACK_WEBHOOK` (Discord) so the in-app BETA
      feedback button actually sends. Set it in local `.env` AND as an EAS env var (preview env).
- [ ] **Snapshot collection** — start the scheduled GBFS poll
      (`scripts/snapshot_availability.py`) to build real absolute-availability data. This is what
      unblocks re-enabling smart pickup (predicted planning is dormant until then).

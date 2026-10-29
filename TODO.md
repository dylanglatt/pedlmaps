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
      app.json, `SENTRY_DSN` in config). REMAINING: (1) ~~lock the SDK-correct version~~ done
      (`~7.11.0` matches SDK 56's expected version); (2) ~~create Sentry org/project~~ done (app.json plugin
      has org + project); (3) ~~set `EXPO_PUBLIC_SENTRY_DSN`~~ done (local `.env` + EAS preview
      env, verified 2026-10-21); (4) `SENTRY_AUTH_TOKEN` exists in the EAS preview env but is
      likely the token that 401'd (`b80c55d`) — validate/regenerate before removing
      `SENTRY_DISABLE_AUTO_UPLOAD` from `eas.json`; (5) native `eas build`.
- [x] **Feedback webhook** — `EXPO_PUBLIC_FEEDBACK_WEBHOOK` is set in local `.env` and the EAS
      preview env (verified 2026-10-21). Still needs a device check that a send arrives.
- [ ] **Snapshot collection** — start the scheduled GBFS poll
      (`scripts/snapshot_availability.py`) to build real absolute-availability data. This is what
      unblocks re-enabling smart pickup (predicted planning is dormant until then).

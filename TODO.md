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

- [ ] **Better voice.** Switch off the default compact iOS voice to an enhanced / Siri on-device
      voice; nudge rate to ~0.95. Free quality jump, no network.
- [ ] **Cleaner phrasing.** A rewrite layer turning raw provider maneuvers ("Head southwest on
      1st Ave toward…") into natural cycling instructions, plus a proper arrival bookend that
      names the place ("You've arrived at Life Time").

## Nav loose end

- [ ] **Stop dwell.** The multi-stop cue says "tap when ready to continue" but nothing gates on
      the tap yet. Only matters once intermediate stops are in use.

## Beta basics (from roadmap, unrelated to nav)

- [ ] **Crash reporting** — Sentry. Needs a native build.
- [ ] **Feedback webhook** — set `EXPO_PUBLIC_FEEDBACK_WEBHOOK` (Discord) so the in-app BETA
      feedback button actually sends. Set it in local `.env` AND as an EAS env var (preview env).
- [ ] **Snapshot collection** — start the scheduled GBFS poll
      (`scripts/snapshot_availability.py`) to build real absolute-availability data. This is what
      unblocks re-enabling smart pickup (predicted planning is dormant until then).

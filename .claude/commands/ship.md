---
description: Commit and push an OTA-safe change (CI publishes the EAS Update to preview)
argument-hint: [commit message]
allowed-tools: Bash(git status:*), Bash(git diff:*), Bash(git add:*), Bash(git commit:*), Bash(git push:*)
---

Ship the current work over-the-air. Steps:
1. Run `git status` + `git diff` and confirm the changes are OTA-safe (JS/TS only — see /ota-safe).
   If anything needs a native build, STOP and tell me instead of pushing.
2. Stage the change, commit with a clear message (use "$ARGUMENTS" if provided, else write one
   from the diff), and push to `main`.
3. Remind me that the GitHub Action will publish the EAS Update to the `preview` channel, and the
   TestFlight/dev build will pick it up on next launch.

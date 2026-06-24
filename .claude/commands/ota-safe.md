---
description: Check whether the current uncommitted changes are OTA-safe or need a native rebuild
allowed-tools: Bash(git diff:*), Bash(git status:*), Read(./**)
---

Review the current uncommitted changes (`git status` + `git diff`) and decide whether they
can ship over-the-air or require a real `eas build`.

OTA-safe = JS/TS-only changes. A NATIVE rebuild is required if any change touches: new/removed
native dependencies in `package.json`, `app.json` (name, icon, permissions, plugins), anything
under `ios/` or `android/`, or adds a new native module / background capability.

Report a one-line verdict (OTA-safe ✅ or needs native build ⚠️) and list exactly which changed
files drove the decision.

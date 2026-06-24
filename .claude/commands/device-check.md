---
description: Produce a device-testing checklist for the current changes
allowed-tools: Bash(git diff:*), Bash(git status:*), Read(./**)
---

Look at the current changes and produce a focused checklist of what must be verified ON A REAL
DEVICE (not web, not this environment) before trusting them — because Google routing,
react-native-maps, voice nav, and background location are native-only. List concrete steps to
reproduce (e.g. specific trip, GPX route, stop-short vs roll-past nav cases) and the expected result.

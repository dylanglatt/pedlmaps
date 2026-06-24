---
description: Sanity-check the trip planner's pure functions with a throwaway Node script
allowed-tools: Bash(node:*), Read(./**), Write(./**), Edit(./**)
---

There is no test framework. Verify trip-planner logic by writing a temporary Node script that
imports the relevant pure function(s) from `lib/tripPlanner.js` (e.g. `planTrip`, `planMultiTrip`,
`choosePredicted`) and asserts the important cases with realistic station fixtures.

$ARGUMENTS

Run it with `node`, print pass/fail per case, then delete the temp script. Also run
`node --check` on any lib file you changed. Be explicit that this only covers pure logic —
anything using Google routing, react-native-maps, or background location still needs a device pass.

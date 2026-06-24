# Using Claude Code to build pedl

A short playbook for building pedl from the terminal with Claude Code (CC) instead of the
desktop Cowork app. You're already CLI-comfortable, so this skips the basics.

## One-time setup

```bash
# Install (native installer — auto-updates; preferred over the deprecated npm package)
curl -fsSL https://claude.ai/install.sh | bash

# Then, from the repo root:
cd ~/Desktop/Projects/citi-bike-app
claude            # first run opens a browser to log in with your Claude account
```

This repo is already configured for CC:

- **`CLAUDE.md`** — loaded into every session. It carries the stack, commands, architecture, and
  the gotchas (Google-CORS/native-only, OTA vs native build, GBFS join, predictions-are-relative,
  don't-rename-AsyncStorage-keys). This matters because **your Cowork memory does not travel to
  CC** — CLAUDE.md is now the durable source of truth. Keep it updated as the project changes
  (or run `/memory` to edit it).
- **`.claude/settings.json`** — permissions. Safe stuff (reads, edits, `npm`/`npx expo`, `node`,
  read-only git, `eas update`) runs without prompting; risky stuff (`git push`, `git commit`,
  `eas build`, `prebuild`, `npm uninstall`) asks first; reading `.env` and `rm -rf` are denied.
- **`.claude/commands/`** — custom slash commands (see below).
- **`TODO.md`** — your current backlog, so CC has it in context.

## The daily loop

1. `claude` in the repo. State the goal in plain language.
2. For anything non-trivial, **enter plan mode first**: press `Shift+Tab` to cycle
   Default → Auto-Accept → **Plan**. In Plan mode CC investigates and proposes a plan but makes
   no edits until you approve — the right default for logic-heavy planner/nav work.
3. Let it edit. It runs the allowed commands itself; it'll ask before pushing or building.
4. Verify. Since there's no test framework, use `/planner-test` for planner logic and remember
   native features (routing, maps, voice nav) still need a **device pass**.
5. Ship OTA-safe JS changes with `/ship` — CI publishes the EAS Update to `preview`.

Useful built-ins: `/clear` (reset context between unrelated tasks — do this often, it keeps CC
sharp and cheap), `/compact` (summarize a long session), `/review` (review your diff),
`/init` (regenerate CLAUDE.md), `/memory` (edit it), `/agents`, `/mcp`, `/config`.

## Custom commands in this repo

- **`/ota-safe`** — checks whether your uncommitted changes can ship OTA or need a native build.
- **`/planner-test`** — writes & runs a throwaway Node script to sanity-check `tripPlanner`
  functions (optionally pass what to test, e.g. `/planner-test the choosePredicted scarce tier`).
- **`/ship [msg]`** — confirms OTA-safety, commits, pushes to `main` (triggers the OTA update).
- **`/device-check`** — produces a device-testing checklist for the current changes.

Edit these any time — they're just markdown in `.claude/commands/`.

## When to use Claude Code vs Cowork

Use **Claude Code** for the core build loop: writing/refactoring features, debugging planner and
nav logic, running `node`/`expo`/`eas`, git, and anything that benefits from living in the repo
with full file context and plan mode. This is where pedl gets built.

Use **Cowork** for things outside the code itself: scheduled tasks (e.g. a recurring GBFS snapshot
poll or a "good morning" briefing), desktop/GUI automation, connectors (Notion, Gmail, Drive),
and quick research. It also keeps the cross-session project memory.

Rule of thumb: **if the work ends in a git commit, use Claude Code; if it ends in a Google/Discord
action, a schedule, or a doc, use Cowork.** They share the same repo on disk, so you can move
between them freely.

## pedl-specific tips

- For laptop iteration set `PROVIDER = 'ors'` in `lib/config.js` (Google routing is native-only
  due to CORS), then `npx expo start` and press `w`.
- CC can't run the iOS simulator or a real device, and can't exercise background location — it
  writes the code and the checks; you run the device pass. Have it produce a precise repro list
  with `/device-check`.
- Keep secrets in `.env` only (CC is denied from reading it). New `EXPO_PUBLIC_*` keys also need
  to be set as EAS env vars in the **preview** environment to reach OTA builds.
- After native-affecting changes, CC should flag that you need `eas build` / `expo prebuild` — it
  won't run those without asking.

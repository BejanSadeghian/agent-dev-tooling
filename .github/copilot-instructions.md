# Instructions for Copilot in this repo

**Start of every session, before any other work:** run `npm run doctor`. If it reports missing
tools, it prints the one install command for this machine — ask the user, run it, then re-run
`npm run doctor` until clean. If `npm` itself is not found, Node.js is missing: install Node 22+
first (macOS: `brew install node`), then run the doctor. If the safety hooks were off, follow with
`npm run setup`.

Then read `robot.txt` at the repo root — it holds every rule that applies specifically to you —
and `README.md` for the concepts. The short version: every use case is a doer/interpreter pair,
you never execute a skill you are developing in your own context (`npm run subagent` does that),
and nothing is saved without passing `npm run check`.

## How to run things

Match what the user asks for to the skill that owns it, and drive the work through these
commands — never hand-roll their jobs:

| The user wants | Use skill | Commands |
| --- | --- | --- |
| Set up this computer | — | `npm run doctor`, then `npm run setup` |
| Build a new skill / use case | `skill-builder` | interview first, then `npm run skill:new` (writes the pair into `skills/`, creating it if absent) |
| Test a skill being built | `skill-builder` | `npm run subagent -- <use-case> "<real task>"` (`--role interpreter`, `--discovery`) — NEVER run the skill yourself |
| Run a repeatable acceptance eval | `skill-builder` | `npm run scenario -- <use-case> [name]` — 3 fresh-sandbox trials, one report; record `--accept`/`--reject` only at the human's explicit direction, with their reason |
| Fix a skill after feedback | `skill-builder` | edit + a regression case for each item, then `npm run regression -- <skill>` |
| Add or fill tests, make fixtures | `test-generator` | `npm run test:new -- <skill>`; fixtures via its seeded `scripts/datagen.mjs` |
| Check everything | — | `npm run check` |
| Publish (confirm checks + save + deliver the pair) | `dev-helper` | `npm run publish -- <use-case>`; if checks fail, the HUMAN may direct `--override "their reason"` — never override on your own |
| Library status | — | `npm run health`, `npm run status` |

Command mechanics: `npm run <verb>` from the repo root; arguments go after `--`. Quote multi-word
arguments. Every command prints what failed and the exact command that fixes it — read that
output to the user in plain language rather than pasting raw logs.

# Skill development environment

This repo is where agent skills get **built and tested** before they ship to the repos that use
them. Every use case becomes a pair of skills — one that processes data exactly, one that
interprets the result — and nothing ships until its checks are green.

You do not need to know git, terminals, or Python to work here. The recommended way to do
everything is to talk to an AI assistant, which does the technical parts for you.

> **AI agents:** your instructions are in [`robot.txt`](robot.txt). Read this page too — the
> concepts live here — but the rules that apply specifically to you live there.

## Getting started — recommended (no CLI needed)

Open this repo in an AI coding assistant — **GitHub Copilot** (in VS Code: open the folder, then
open Copilot Chat) or **Claude Code**. The assistant picks up this repo's built-in skills
automatically and runs every command for you. You just say what you want:

| Say something like | What the assistant does |
| --- | --- |
| "Set this repo up on my computer" | Checks the tools, switches on the safety checks, runs everything once |
| "I want to build a skill for ___" | Interviews you about it (one question at a time), then generates the whole pair with its tests |
| "Test it on a real task: ___" | Runs the skill with a **fresh, separate agent** and shows you what it produced |
| "It should have done X instead" | Fixes the skill AND adds a test so that mistake can never come back |
| "Check my work" | Runs every check and explains anything that fails, in plain words |
| "Save my work" | Checks first, then saves and uploads it on its own branch |
| "Ask for a review" / "Open a pull request" | Opens the review request with the right reviewers |
| "Ship ___ to our team's repo" | Copies the finished pair to the repo that will use it |
| "How is the library doing?" | Shows the health report: anything untested, stale, or half a pair |

Two things worth knowing:

- **Nothing is saved without passing its checks.** The assistant literally cannot commit work
  that fails the gate — the same gate runs again in CI, so nothing slips through.
- **You develop in one chat, but testing happens in a fresh one.** The assistant that wrote a
  skill already knows what it *meant* to say, so it would paper over the gaps. Testing always
  uses a clean sub-agent that has never seen your conversation.

## Getting started — advanced (direct CLI)

There is nothing to `npm install` — the tooling has zero package dependencies (npm is only the
command runner, and the Python harness is stdlib-only). You need the runtimes: Node 22+,
Python 3.11+, git; `npm run setup` checks them and says what is missing. On Windows, use Git Bash
or WSL. Everything the assistant does maps to an npm command you can run yourself:

```bash
npm run setup                  # one-time: check tools, wire the safety hooks, run everything once
npm run skill:new              # interview → generate a complete pair into development/
npm run subagent -- <uc> "..." # clean sub-agent run of a skill under development
                               #   (--role interpreter, --discovery to test triggering)
npm run test:new -- <skill>    # find and fill coverage gaps
npm run check                  # lint · format+roles · tests · rubric · health
npm run status                 # where you are, what to do next
npm run start "topic"          # a branch for this piece of work
npm run save "what I did"      # checks, commits, uploads
npm run ship "title"           # pull request for this repo's changes
npm run publish -- <uc>        # ship a green pair to a target repo (.framework/targets.json)
npm run health                 # is the library drifting? incomplete pairs?
```

## The pair

| Half | What it is |
| --- | --- |
| `<use-case>-doer` | As low-level and procedural as possible. Deterministic Python in `scripts/` turns input data into ONE structured artifact whose shape is committed in `references/schema.md`. It always conforms; anything the input forced is reported in the artifact's `deviations` field, never absorbed into a new shape. Verified exactly: accuracy, edge cases, performance. |
| `<use-case>-interpreter` | Reads that artifact and produces a two-part output: **Facts** (each traceable to the artifact, deviations included), then **Interpretations** (judgment applying its lens, adapted by `references/variations/`). A reader can always tell data from opinion. |

A missing half is a warning, never a blocker — the health report keeps naming it.

## What the folders are

| Folder | In plain words |
| --- | --- |
| `development/` | The workshop: skills being built, one directory per skill, in pairs. Deliberately invisible to your assistant's skill list, so a work in progress only ever runs inside a clean sub-agent. |
| `.github/skills/` | The assistant's tools for working *here*: `skill-builder`, `test-generator`, `dev-helper`. This is what Copilot discovers and loads. |
| `.framework/` | The machinery — never edited by hand. The spec (`FRAMEWORK.md`), the one contract every check reads (`framework.json`), the validators, the Python test harness, the pre-commit hook, and the tooling's own tests. |
| `.framework/state/` | The inspection stickers. After a skill's tests pass, the test runner records the result here with a fingerprint of exactly the version it tested. Change the skill and the sticker no longer matches — the gate refuses the work until the tests run again. Stickers travel with your change as proof; only the test runner writes them. |

## What keeps it honest

- **One contract, three enforcement points.** `.framework/framework.json` is read by
  `npm run check`, the pre-commit hook, and CI — the same gate everywhere, plus a CI job proving
  hook parity.
- **Freshness rule.** Editing a skill without re-running its suite fails the gate.
- **Exactness lives in code.** Anything that must be reproducible is deterministic Python in the
  doer, tested for accuracy, edge cases, and performance.
- **Clean sub-agents only.** The developing agent's context never contaminates a test run, and
  sub-agent runs (nondeterministic) never gate a commit.

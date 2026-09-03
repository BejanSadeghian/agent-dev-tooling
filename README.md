# Skill development environment

This repo is where agent skills get **built and tested** before they ship to the repos that use
them. Every use case becomes a pair of skills — one that processes data exactly, one that
interprets the result — and nothing ships until its checks are green.

You do not need to know git, terminals, or code to work here. You talk to an AI assistant; it
does the technical parts for you.

> **AI agents:** your instructions are in [`robot.txt`](robot.txt). Read this page too — the
> concepts live here — but the rules that apply specifically to you live there.

## Getting started

Open this repo in an AI coding assistant — **GitHub Copilot** (in VS Code: open the folder, then
open Copilot Chat) or **Claude Code**. The assistant picks up this repo's built-in skills
automatically. You just say what you want:

| Say something like | What the assistant does |
| --- | --- |
| "Set this repo up on my computer" | Checks your computer has what it needs, offers to install anything missing, and switches on the safety checks |
| "I want to build a skill for ___" | Interviews you about it (one question at a time), then generates the whole pair with its tests |
| "Test it on a real task: ___" | Runs the skill with a **fresh, separate agent** and shows you what it produced |
| "It should have done X instead" | Fixes the skill AND adds a test so that mistake can never come back |
| "Check my work" | Runs every check and explains anything that fails, in plain words |
| "Save my work" | Checks first, then saves and uploads it on its own branch |
| "Ask for a review" | Opens the review request with the right reviewers |
| "Ship ___ to our team's repo" | Copies the finished pair to the repo that will use it |
| "How is the library doing?" | Shows the health report: anything untested, stale, or half a pair |

Two things worth knowing:

- **Nothing is saved without passing its checks.** The assistant literally cannot save work that
  fails them, and the same checks run again on GitHub — nothing slips through.
- **You develop in one chat, but testing happens in a fresh one.** The assistant that wrote a
  skill already knows what it *meant* to say, so it would paper over the gaps. Testing always
  uses a separate agent that has never seen your conversation.

Prefer a terminal? The command-line version of everything above is in
[docs/advanced.md](docs/advanced.md).

## The pair

| Half | What it is |
| --- | --- |
| The **doer** | Does the mechanical work: turns input data into one structured result whose exact shape is agreed in advance. It never bends that shape — anything odd about the input is listed in a "deviations" note instead. Because it is mechanical, it can be tested for being exactly right. |
| The **interpreter** | Reads the doer's result and writes two clearly separated sections: **Facts** (only what the data shows, each pointing back to it) and **Interpretations** (what it means). A reader can always tell data from opinion. |

A pair missing one half is flagged in the health report, but never blocks your work.

## What the folders are

| Folder | In plain words |
| --- | --- |
| `development/` | The workshop: skills being built, in pairs. It appears when you build your first one. Kept invisible to your assistant on purpose, so a work in progress only ever runs in that fresh, separate agent. |
| `.github/skills/` | The assistant's own tools for working here (described below). |
| `.framework/` | The machinery that checks everything — never edited by hand. |
| `.framework/state/` | The inspection stickers: proof of when each skill's tests last passed, and of exactly which version was tested. Change a skill and its sticker stops matching, so the tests must run again. Only the machinery writes these. |

## The built-in skills

These are what your assistant reaches for when you ask for things — you never use them directly:

| Skill | What it does |
| --- | --- |
| `skill-builder` | Builds a use case end to end: reads your material, interviews you, generates the pair, then improves it through fresh-agent test runs — every piece of your feedback becomes both a fix and a test. It is forbidden from running a skill it is building in its own chat. |
| `test-generator` | Fills test gaps and makes safe, realistic practice data (never real or random data). Any bug you report becomes a test that fails first, then passes — so it can never quietly return. |
| `dev-helper` | Handles saving, uploading, and review requests for people who do not use git — in plain language, refusing the dangerous moves. |

## What keeps it honest

- **One rulebook, checked in three places:** on your computer as you work, before anything is
  saved, and again on GitHub.
- **Freshness rule:** a skill edited without re-running its tests cannot be saved.
- **Exactness lives in code:** anything that must be reproducible is real, tested code — never
  something a model computed in its reply.
- **Fresh agents only:** the chat that builds a skill never gets to grade it.

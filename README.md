# Skill development environment

This repo is where agent skills get **built and tested** before they ship to the repos that use
them. Every use case becomes a pair of skills — one that processes data exactly, one that
interprets the result — and nothing ships until its checks are green.

You do not need to know git, terminals, or code to work here. You talk to an AI assistant; it
does the technical parts for you.

> **AI agents:** your instructions are in [`robot.txt`](robot.txt). Read this page too — the
> concepts live here — but the rules that apply specifically to you live there.

## Getting started: your first skill, step by step

> **Before anything:** clone this repo and open it in VS Code with Copilot Chat (or Claude
> Code). Clone once — after that, just reopen the folder.

Work through the steps in order. (Prefer a terminal? The same walkthrough with the actual
commands and their output is in [docs/advanced.md](docs/advanced.md).)

### Step 1 — initialize

> Prompt: "Set this repo up on my computer."

**What happens:**

- Checks your computer has what this repo needs (Node, Python, git).
- Anything missing: shows you one install command, asks permission first.
- Switches on the safety checks and runs everything once.
- Safe to repeat — an already-set-up computer just gets confirmed.

**Done when:** everything passed. ("Reviewers not configured" is fine for now.)

### Step 2 — build a skill

> Prompt: "I want to build a skill for ___" — describe the job in your own words; paste any
> notes or examples you have.

**What happens:**

- An interview, one question at a time — usually 8–15 questions.
- Answer from real examples; say "I don't know" rather than guessing.
- Generates two skill folders (doer + interpreter) into `skills/`, tests included.
- Comes back with follow-ups while it turns placeholders into your real rules.

**Done when:** the pair exists in `skills/` and its checks pass.

### Step 3 — test it

> Prompt: "Test it on a real task: ___" — a genuine task, not an invented one.

**What happens:**

- A **fresh, separate agent** (which never saw your chat) runs the skill.
- You get its transcript and the result it produced.
- An automatic verdict: right shape? Facts separated from Interpretations?

**Done when:** you have read the result. Messy first runs are normal.

### Step 4 — edit with feedback

> Prompt: "It should have done X instead" — one piece of feedback at a time, about the output.

**What happens:**

- Each item becomes a fix AND a test that would have caught it.
- The test fails first, then passes — so the mistake can never return.
- The skill's tests re-run and the fresh result is recorded.

**Done when:** two test runs in a row need no fixes.

### Step 5 — validate

> Prompt: "Check my work."

**What happens:**

- Every check runs: format, pair rules, all tests, nothing-edited-without-retesting.
- Anything wrong is explained in plain words, with the fix.

**Done when:** all checks passed.

### Step 6 — save

> Prompt: "Save my work."

**What happens:**

- Checks run again first; a failure means nothing is saved.
- Work is saved and uploaded on its own branch, never the shared one.

**Done when:** it confirms "saved and uploaded".

### Step 7 — review and ship

> Prompt: "Ask for a review." — then, once approved: "Ship ___ to our team's repo."

**What happens:**

- A review request opens on GitHub so a person approves before merge.
- Shipping asks for the receiving repo's address the first time, then remembers it.
- The pair is re-verified, copied over, and a review request opens there too.

**Done when:** you have the receiving repo's review link.

## Quick reference — things you can say

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

## The pair

| Half | What it is |
| --- | --- |
| The **doer** | Does the mechanical work: turns input data into one structured result whose exact shape is agreed in advance. It never bends that shape — anything odd about the input is listed in a "deviations" note instead. Because it is mechanical, it can be tested for being exactly right. |
| The **interpreter** | Reads the doer's result and writes two clearly separated sections: **Facts** (only what the data shows, each pointing back to it) and **Interpretations** (what it means). A reader can always tell data from opinion. |

A pair missing one half is flagged in the health report, but never blocks your work.

## What the folders are

| Folder | In plain words |
| --- | --- |
| `skills/` | The workshop: skills being built, in pairs. It appears when you build your first one. Kept invisible to your assistant on purpose, so a work in progress only ever runs in that fresh, separate agent. |
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

# Skill development environment

This repo is where agent skills get **built and tested** before they ship to the repos that use
them. Every use case becomes a pair of skills — one that processes data exactly, one that
interprets the result — and nothing ships until its checks are green.

You do not need to know git, terminals, or code to work here. You talk to an AI assistant; it
does the technical parts for you.

> **AI agents:** your instructions are in [`robot.txt`](robot.txt). Read this page too — the
> concepts live here — but the rules that apply specifically to you live there.

## Getting started: your first skill, step by step

Work through these in order. Each step tells you what to say to your assistant, what happens
while it works, and how you know it worked. (Prefer a terminal? The same walkthrough with the
actual commands and their output is in [docs/advanced.md](docs/advanced.md).)

### Step 0 — open the repo in an assistant (once)

Install [VS Code](https://code.visualstudio.com) with GitHub Copilot (or use Claude Code). In
VS Code choose **Clone Git Repository**, paste this repo's address, open the folder, then open
the Copilot Chat panel. The assistant reads this repo's rules and tools automatically — you never
have to tell it how things work here.

### Step 1 — initialize

**Say:** "Set this repo up on my computer."

**What happens:** it checks that your computer has the three things this repo needs (Node,
Python, git). If something is missing it shows you one install command and asks permission before
running it. Then it switches on the safety checks and runs every check once to prove the setup
works.

**Done when:** it tells you everything passed. If it mentions "reviewers are not configured yet",
that is fine — it matters only when you ask for a review later.

### Step 2 — build a skill

**Say:** "I want to build a skill for ___" — and describe the job in your own words. Paste in any
notes, examples, or documents you have.

**What happens:** an interview, one question at a time — what the skill is called, when it should
fire, when it must NOT fire, what fields the result carries, what the steps are, and how the
result should be judged. Usually 8–15 questions. Answer from real examples ("last time I did
this, I…"); say "I don't know" rather than guessing — it will propose a default. Then it
generates **two** skill folders (the doer and the interpreter), with the result's agreed shape
and all the tests, and fills in the real logic from your answers.

**Done when:** it shows you the new pair inside `development/` and says the generated checks
pass. Expect it to come back with a few follow-up questions while it replaces placeholders with
your real rules — that is normal.

### Step 3 — test it

**Say:** "Test it on a real task: ___" — a genuine task from your queue, not an invented one.

**What happens:** it hands the task to a **fresh, separate agent** that has never seen your
conversation (this matters: your own chat knows what the skill *meant* to say and would paper
over gaps). You get the transcript of what that agent did, the result it produced, and an
automatic verdict: did the result match the agreed shape, and are Facts separated from
Interpretations.

**Done when:** you have read the result and formed an opinion. A messy first run is expected —
that is what the next step is for.

### Step 4 — edit with feedback

**Say:** "It should have done X instead" / "It broke on this file" / "That number is wrong" —
one piece of feedback at a time, about the output.

**What happens:** every piece of feedback becomes TWO things: a fix to the skill and a new test
that would have caught it — written to fail first, then pass once fixed. So a mistake made once
can never quietly return. It re-runs the skill's tests and records the fresh result.

**Done when:** a test run (step 3 again) needs no improvising and you would sign off on the
output. Two clean runs in a row is the bar.

### Step 5 — validate

**Say:** "Check my work."

**What happens:** every check runs — the skill's format, the pair rules, every test, and whether
anything was edited without re-testing. Anything wrong is explained in plain words with what
fixes it.

**Done when:** it says all checks passed.

### Step 6 — save

**Say:** "Save my work."

**What happens:** the checks run again first; only if everything passes does it save your work
and upload it to GitHub on its own branch (never on the shared main branch). If a check fails,
nothing is saved and it tells you why.

**Done when:** it confirms "saved and uploaded".

### Step 7 — review and ship

**Say:** "Ask for a review" — it opens a review request on GitHub with your configured reviewers,
so a person approves the work before it joins the shared branch.

Then, when the pair is approved and green: **"Ship ___ to our team's repo."** The first time, it
will ask you for the address of the repo that should receive skills and remember it. It verifies
the pair passes everything, copies it over on its own branch, and opens a review request there
too. That receiving repo is where people actually use the skill.

**Done when:** it gives you the link to the review request in the receiving repo.

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

# Skill development environment

This project (a "repo" — a shared folder that lives on GitHub) is where agent **skills** get
built and tested. A skill is a set of instructions an AI assistant can follow to do one job
well — for example: *read a timesheet export and flag overtime*, or *turn raw survey answers
into a scored summary*. Only two folders matter in this guide: this workshop (where skills are
built) and your team's repo (where finished skills get delivered). Every skill you build
becomes a pair — one half processes data exactly, the other explains what the result means —
and nothing ships until its checks pass.

You do not need to know git, terminals, or code to work here. You talk to an AI assistant; it
does the technical parts for you.

> **AI agents:** your instructions are in [`robot.txt`](robot.txt). Read this page too — the
> concepts live here — but the rules that apply specifically to you live there.
> *(If you are a person: you can ignore that file — this page is yours.)*

## Getting started: your first skill, step by step

### Step 0 — one-time setup (the only step you do by hand)

**Have these two things first** (five minutes with whoever asked you to do this, if you don't):

- A **GitHub account with Copilot access**. If your company uses GitHub, use the account they
  gave you (a personal one may not have access to the team's repos). No account? Create one at
  [github.com/signup](https://github.com/signup) and ask your team to add you.
- The **web address of your team's repo** — where finished skills get delivered. You won't
  need it until the very last step, so you can start without it; just know who to ask.

**Then set up (once):**

1. Install [VS Code](https://code.visualstudio.com) — a free program where the AI assistant
   lives. Open it, click the little person icon in the bottom-left corner, and sign in with
   your GitHub account so **Copilot** works.
2. Get this project into VS Code:
   - **If the project folder is already on your computer** (someone sent or set it up):
     **File → Open Folder**, pick it, done.
   - **If not:** the project lives at a web address (it's in your browser's address bar if
     you're reading this on GitHub — otherwise ask the person who sent you here). In VS Code
     choose **Clone Git Repository**, paste that address, pick where to keep it. Once — after
     that, just **File → Open Recent**.
3. Open the **Copilot Chat panel**: the speech-bubble icon in the left icon column, or press
   **⌃⌘I** on a Mac (**Ctrl+Alt+I** on Windows).

> **Every "Prompt" in this guide gets typed into that Copilot Chat panel — never into ChatGPT
> or a browser.** A chat outside this folder cannot see your computer and will happily
> pretend things worked when nothing happened. (That includes setup trouble: if something in
> this step goes wrong, ask the person who sent you here — not a chatbot in a browser.)

From here on, the assistant does everything — work through the steps in order. (Prefer a
terminal? The same walkthrough with the actual commands is in
[docs/advanced.md](docs/advanced.md).)

### Step 1 — initialize

> Prompt: "Set this repo up on my computer."

**What happens:**

- Checks your computer has three standard free tools this project needs (called Node,
  Python, and git — you never use them directly).
- Anything missing: it asks your permission, then installs. Saying yes is safe; on a locked
  company machine, forward what it names to IT.
- Switches on the safety checks and runs everything once.
- Safe to repeat — an already-set-up computer just gets confirmed.

**Done when:** everything passed — optional items (reviewers, the Copilot CLI for test runs) can be installed when first needed, and the assistant will offer.

### Step 2 — build a skill

> Prompt: "I want to build a skill for ___" — describe the job in your own words; paste any
> notes or examples you have.

**What happens:**

- It reads everything you gave it first, and plays back what it learned.
- Then an interview about the gaps only, one question at a time — and you steer it ("focus on
  the trigger", "skip that").
- Answer from real examples; say "I don't know" rather than guessing.
- Generates two skill folders into `skills/`, tests included: the **doer** (does the
  mechanical work exactly) and the **interpreter** (says what the result means — facts first,
  then opinion).
- Comes back with follow-ups while it turns placeholders into your real rules.

**Done when:** the pair exists in `skills/` and its checks pass.

### Step 3 — test it

> Prompt: "Test it on a real task: ___" — a genuine task from your queue, not an invented
> one.

A word on your data: the assistant keeps your real files in a spot that is never uploaded —
what eventually gets published is the **skill** (instructions and tests), never your data.
The AI does read what you show it, though, so for genuinely sensitive material follow your
company's AI policy.

**What happens:**

- A **fresh, separate agent** (which never saw your chat) runs the skill — automatic, you never open it yourself.
- You get its transcript and the result it produced.
- An automatic verdict: right shape? Facts separated from Interpretations?
- Say **"make this a repeatable test"** to save the task as a scenario: it re-runs three times
  from scratch, and you get one report card showing what held up and what wavered — a verdict
  you can overrule, with your reason kept on record.

**Done when:** you have read the result. Messy first runs are normal.

### Step 4 — edit with feedback

> Prompt: "It should have done X instead" — one piece of feedback at a time, about the output.

**What happens:**

- Each item becomes a fix AND a test that would have caught it.
- You may see a red "failed" flash by — that is deliberate: the new test is shown failing
  once to prove it can catch the mistake, then it passes forever.
- The skill's tests re-run and the fresh result is recorded.

**Done when:** you prompt **"Test it again"** (same task) and two runs in a row come back clean.

### Step 5 — validate

> Prompt: "Check my work."

**What happens:**

- Every check runs: format, pair rules, all tests, nothing-edited-without-retesting.
- Anything wrong is explained in plain words, with the fix.

**Done when:** all checks passed.

### Step 6 — publish

> Prompt: "Publish ___ to our team's repo."

**What happens:**

- The checks run one more time; nothing goes out unless they confirm.
- If they don't confirm, it's still your call: say "publish anyway — because ___" and your
  reason goes on the record.
- Your work is quietly saved and uploaded first, so nothing is ever lost.
- The pair is copied to the receiving repo (it asks for the address once, then remembers), and a
  review request opens there.

**Done when:** you have the receiving repo's review link.

## Quick reference — things you can say

| Say something like | What the assistant does |
| --- | --- |
| "Set this repo up on my computer" | Checks your computer has what it needs, offers to install anything missing, and switches on the safety checks |
| "I want to build a skill for ___" | Interviews you about it (one question at a time), then generates the whole pair with its tests |
| "Test it on a real task: ___" | Runs the skill with a **fresh, separate agent** and shows you what it produced |
| "Make this a repeatable test" | Saves the task as a scenario: three fresh runs, one report card with a pass grid, a verdict you can overrule |
| "Accept that test result anyway — because ___" | Rare. Records your override on the report card, reason and name attached; the machine's verdict stays visible underneath |
| "Waive C3 on that report — because ___" | Accepts just that one failing check (each row on the report card has a short ID); everything else still counts |
| "It should have done X instead" | Fixes the skill AND adds a test so that mistake can never come back |
| "Test it again" | Re-runs the same task with a fresh agent — how you confirm a fix landed |
| "Check my work" | Runs every check and explains anything that fails, in plain words |
| "Publish ___ to our team's repo" | Confirms the checks, saves your work, delivers the pair with a review request — one ask |
| "Publish anyway — because ___" | Rare. Overriding means shipping something the checks call broken — hear the explanation first. Your reason goes on the record with your name |
| "How is the library doing?" | Shows the health report: anything untested, stale, or half a pair |

Two things worth knowing:

- **Nothing is published without its checks confirming.** The assistant cannot deliver failing
  work on its own — only you can say "publish anyway", and your reason is recorded.
- **You develop in one chat, but testing happens in a fresh one.** The assistant that wrote a
  skill already knows what it *meant* to say, so it would paper over the gaps. Testing always
  uses a separate agent that has never seen your conversation.

## The pair

| Half | What it is |
| --- | --- |
| The **doer** | Does the mechanical work: turns input data into one structured result whose exact shape is agreed in advance. It never bends that shape — anything odd about the input is listed in a "deviations" note instead. Because it is mechanical, it can be tested for being exactly right. |
| The **interpreter** | Reads the doer's result and writes two clearly separated sections: **Facts** (only what the data shows, each pointing back to it) and **Interpretations** (what it means). A reader can always tell data from opinion. |

Why two halves? So the mechanical part can be tested for being *exactly* right, and the
judgment part can never quietly invent numbers — each half is checkable in its own way. A pair
missing one half is flagged in the health report, but never blocks your work.

## What the folders are

| Folder | In plain words |
| --- | --- |
| `skills/` | The workshop: skills being built, in pairs. It appears when you build your first one. Your assistant edits these files like any others, but never *runs* a half-built skill itself — running is always done by that fresh, separate agent. |
| `.github/skills/` | The assistant's own tools for working here (described below). |
| `.framework/` | The machinery that checks everything — never edited by hand. |
| `.framework/state/` | The inspection stickers: proof of when each skill's tests last passed, and of exactly which version was tested. Change a skill and its sticker stops matching, so the tests must run again. Only the machinery writes these. |

What is *inside* each skill folder is defined in the framework spec — see
[Skill layout](.framework/FRAMEWORK.md#2-skill-layout-agentskillsio). (For the curious — you
never need to open it; the assistant knows it.)

## The built-in skills

These are what your assistant reaches for when you ask for things — you never use them directly:

| Skill | What it does |
| --- | --- |
| `skill-builder` | Builds a use case end to end: reads your material, interviews you, generates the pair, then improves it through fresh-agent test runs — every piece of your feedback becomes both a fix and a test. It is forbidden from running a skill it is building in its own chat. |
| `test-generator` | Fills test gaps and makes safe, realistic practice data (never real or random data). Any bug you report becomes a test that fails first, then passes — so it can never quietly return. |
| `dev-helper` | Handles saving, uploading, and review requests for people who do not use git — in plain language, refusing the dangerous moves. |

## How testing works

Three layers, from smallest to most lifelike — full details live in the framework's
[testing framework](.framework/framework-testing.md), which is the source of truth:

1. **Exact tests on the code.** The doer's mechanical work is checked for being exactly right,
   for surviving weird input, and for staying fast as data grows.
2. **Rule checks on the documents.** Every hard rule a skill states — and every piece of feedback
   you ever gave — is pinned so it cannot quietly disappear.
3. **Scenario tests on the agent itself.** A saved task with its own starting files runs in a
   **fresh workspace with a fresh agent, three times**. Checks look at everything that came out —
   including the in-between artifacts and *how* the agent worked, not just the final answer — and
   an AI judge grades the result against your standards. You get **one report card per scenario**
   with a pass grid across the three runs, and you can overrule its verdict (your reason is kept
   on record). These run before shipping; they never block saving.

All practice data is **made up and reproducible** — never real, never random. Your real files can
be used for one-off runs but are never saved into the repo. That contract is the
[data generation framework](.framework/framework-data.md).

## What keeps it honest

- **One rulebook, checked in three places:** on your computer as you work, before anything is
  saved, and again on GitHub.
- **Freshness rule:** a skill edited without re-running its tests cannot be saved.
- **Exactness lives in code:** anything that must be reproducible is real, tested code — never
  something a model computed in its reply.
- **Fresh agents only:** the chat that builds a skill never gets to grade it.

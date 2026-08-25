# Skill development environment

Skills are **developed here and used elsewhere**. Every use case ships as a pair, built to the
[agentskills.io](https://agentskills.io) layout, gated deterministically, tested by a clean
sub-agent, and pushed to the repo that will use it.

**If you are an agent landing in this repo:** the contract you must follow is
`.framework/FRAMEWORK.md` (machine-mirrored in `.framework/framework.json`, which the pre-commit
hook and CI enforce). The three skills in `.github/skills/` — `skill-builder`, `test-generator`,
`dev-helper` — are your tools for working here. Two rules above all: every use case is a
doer/interpreter pair, and you never execute a skill you are developing in your own context —
`npm run subagent` does that with a fresh agent.

## The pair

| Half | What it is |
|---|---|
| `<use-case>-doer` | As low-level and procedural as possible. Deterministic Python in `scripts/` turns input data into ONE structured artifact whose shape is committed in `references/schema.md`. It always conforms; anything the input forced is reported in the artifact's `deviations` field, never absorbed into a new shape. Verified exactly: accuracy, edge cases, performance. |
| `<use-case>-interpreter` | Reads that artifact and produces a two-part output: **Facts** (each traceable to the artifact, deviations included), then **Interpretations** (judgment applying its lens, adapted by `references/variations/`). A reader can always tell data from opinion. |

A missing half is a warning, never a blocker — `npm run health` keeps naming it.

## The three zones

```text
development/          skills being built — invisible to Copilot, gated by hook + CI
.github/skills/       the dev tools — what YOUR authoring agent uses (Copilot discovers these)
<target repo>         where finished pairs get shipped: npm run publish -- <use-case>
```

Testing a skill under development never happens in the authoring chat:
`npm run subagent -- <use-case> "a real task"` launches a fresh Copilot CLI process that reads the
latest skill from disk, saves the transcript under the skill's `evals/runs/`, and checks the
output deterministically (schema conformance; Facts before Interpretations). Add `--discovery` to
test that the description alone triggers the skill.

## Quickstart

```bash
npm run setup                  # checks tools, wires the hooks, runs everything once
npm run skill:new              # interview → generate a complete pair into development/
npm run check                  # lint · format+roles · tests · rubric · health
```

Day to day:

```bash
npm run status                 # where you are, what to do next
npm run start "topic"          # a branch for this piece of work
npm run subagent -- <uc> "..." # clean sub-agent run of the skill under development
npm run test:new -- <skill>    # find and fill coverage gaps
npm run save "what I did"      # checks, commits, uploads
npm run ship "title"           # pull request for this repo's changes
npm run publish -- <uc>        # ship a green pair to the target repo
npm run health                 # is the library drifting? incomplete pairs?
```

## What keeps it honest

- **One contract, three enforcement points.** `.framework/framework.json` is read by
  `npm run check`, the pre-commit hook, and CI — the same gate everywhere, plus a CI job proving
  hook parity.
- **Freshness rule.** Each skill's suite result and content hash are recorded in `.skill-state/`;
  editing a skill without re-running its suite fails the gate.
- **Exactness lives in code.** Anything that must be reproducible is deterministic Python in the
  doer, with accuracy/edge/performance tests on the stdlib-only harness in `.framework/harness/`.
- **Clean sub-agents only.** The developing agent's context never contaminates a test run, and
  sub-agent runs (nondeterministic) never gate a commit.

Everything machinery lives in `.framework/` — spec, config, validators, harness, hook, templates,
its own tests. The visible root stays: this file, `development/`, `package.json`.

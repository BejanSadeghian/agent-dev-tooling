# Picking the layer and the cases

## Layer

Choose the cheapest layer that can actually catch the failure.

| Failure you are guarding | Layer | Why not lower/higher |
|---|---|---|
| Pure logic, branching, calculation | unit | An E2E test for a rounding rule is a slow way to learn about rounding. |
| Serialization, status codes, validation, auth | API/integration | Unit tests mock away the exact layer that breaks. |
| A flow a user performs across screens | E2E | Nothing below the browser proves the flow. |
| A schema/config/contract shape | schema test | Cheap, and it fails on the file that changed. |
| An agent skill's rules | skill regression case | See `skill-builder` and `SKILL_FORMAT.md` §3. |

One E2E test for the happy path plus unit tests for the branches beats five E2E tests. E2E is where
determinism goes to die: keep it thin.

## Case checklist

For each behaviour, walk the list and keep what earns its keep:

- **Contract** — one test per documented branch, including the error branches.
- **Boundaries** — first/last/one-past, empty/one/many, min/max/min-1/max+1, zero, null when nullable.
- **Adversarial** — quotes, commas, newlines, unicode, emoji, oversized input, wrong type, injection strings.
- **State** — repeated calls (idempotency), out-of-order calls, concurrent calls if the code claims to handle them.
- **Regression** — one per previously reported bug, named for the cause.

## What not to test

- Framework or library behaviour — test your use of it, not it.
- Getters, constants, and pure re-exports.
- Implementation details that a legitimate refactor would break (private call order, internal names).
- Anything whose assertion you cannot state before writing the code — that is exploration, not a test.

## Determinism rules

- Freeze the clock; never assert on "now".
- Seed every generator; never call an unseeded random source.
- No network in unit or API tests — stub at the boundary.
- No inter-test ordering, no shared mutable fixture, no leftover rows.
- Run the suite twice before you ship it. Different results = not done.

## Naming

`<subject> <expected behaviour> <condition>` — `rejects an order whose customer was deleted`. If the
name needs "and", it is two tests.

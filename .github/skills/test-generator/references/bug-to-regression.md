# Turning a bug into a permanent test

A bug fixed without a test is a bug scheduled for re-release.

## Steps

1. **Reproduce it first, in code.** Write the test against the *unfixed* code and watch it fail with
   the actual symptom. If you cannot reproduce it, stop and go get the missing detail — inputs, env,
   sequence, timing. A test written from a guess guards a guess.
2. **Shrink the reproduction.** Strip everything not needed to fail. Ideally one call, fixed inputs,
   one assertion. The shrunk case tells you the real cause, which is often not the reported one.
3. **Name it for the cause, not the ticket.** `keeps the cart total when a line item is removed twice`
   beats `regression bug 412`. Put the ticket in a comment or a `provenance` field.
4. **Assert the symptom the reporter saw**, not the internal detail you happened to fix. The fix will
   be refactored; the symptom must stay guarded.
5. **Pin the data.** Use a seeded fixture (`references/data-generation.md`); if the bug needed a
   specific value, inline that value with a comment saying why it is special.
6. **Fix the code, watch it go green**, then re-run the whole suite — a regression test that only
   passes in isolation is hiding a shared-state bug.
7. **File it where the suite lives**, in the layer that could actually catch it, and make sure the
   repo's test command picks it up.

## For agent skills

The same loop, expressed as a case in `evals/cases/*.json`: the feedback is the bug, the case is the
guard, `provenance` records who reported it and when. See `skill-builder`'s
`references/regression-tests.md`.

## Definition of done

- The test fails on the unfixed code, with the reported symptom.
- It passes on the fixed code.
- It passes when the whole suite runs, and on a second run.
- Its name says what broke.

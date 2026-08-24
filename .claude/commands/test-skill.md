---
description: Find and fill the test gaps for a skill — accuracy, edge cases, and performance for every artifact and entrypoint.
---

Use the `test-generator` skill.

1. Run `npm run test:new -- $ARGUMENTS` (no argument: report gaps across every skill).
2. For each gap it writes, replace the placeholder expectations with real ones: the smallest input
   whose correct answer I could state without running the code.
3. Make sure the performance tests use sizes that match my real data, and print the time/memory
   table in your reply.
4. Run `npm run check` and tell me what changed, in one line per test added.

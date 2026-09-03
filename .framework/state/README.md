# Machine-written — do not edit

These files are the inspection stickers: for each skill, the recorded result of its last test run
and a fingerprint of exactly the files that were tested (performance measurements under `perf/`).
The gate compares the fingerprint against the skill's current files to catch "edited but not
re-tested".

Only the test runner writes here (`npm run regression`, or your assistant running the checks).
Editing a sticker by hand does not make a skill pass — the fingerprint will not match and the gate
will still refuse it. The files ARE committed with your change: they are the proof the tests ran.

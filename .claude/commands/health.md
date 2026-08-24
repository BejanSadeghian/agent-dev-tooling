---
description: Report the health of the whole skill library and what to fix first.
---

Run `npm run health`.

Then give me a short read of it, in this order:

1. Anything red, with the command that fixes it — offer to fix it now.
2. Skills whose descriptions overlap, and which one you would sharpen.
3. Skills not exercised in a long time, or with thin test cover.
4. Anything whose performance is drifting.

Keep it under fifteen lines. Refer to `docs/KEEPING-QUALITY.md` for the routine, not the theory.

# Agents: start here

**Start of every session, before any other work:** run `npm run doctor`. If it reports missing
tools, it prints the one install command for this machine — ask the user, run it, then re-run
`npm run doctor` until clean. If `npm` itself is not found, Node.js is missing: install Node 22+
first (macOS: `brew install node`), then run the doctor. If the safety hooks were off, follow with
`npm run setup`.

Then read `robot.txt` (every rule that applies specifically to you) and `README.md` (the
concepts). The short version: every use case is a doer/interpreter pair, you never execute a
skill you are developing in your own context (`npm run subagent` does that), and nothing is saved
without passing `npm run check`.

#!/usr/bin/env bash
# One-time setup. Safe to run again at any time.
#
#   bash setup/install.sh
#
# Checks the tools this repo needs, switches on the safety checks that run before
# every save, and proves the whole thing works by running the checks once.
set -euo pipefail

cd "$(git rev-parse --show-toplevel 2>/dev/null || dirname "$(dirname "$(readlink -f "$0")")")"

ok()   { printf '  \033[32mok\033[0m   %s\n' "$1"; }
warn() { printf '  \033[33mnote\033[0m %s\n' "$1"; }
bad()  { printf '  \033[31mmiss\033[0m %s\n' "$1"; }

echo "Setting up this repo"
echo

MISSING=0

if command -v git >/dev/null 2>&1; then ok "git"; else bad "git — install from https://git-scm.com/downloads"; MISSING=1; fi

if command -v node >/dev/null 2>&1; then
  NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
  if [ "$NODE_MAJOR" -ge 22 ]; then ok "Node.js $(node -v)"; else bad "Node.js $(node -v) is too old — install 22 or newer from https://nodejs.org"; MISSING=1; fi
else
  bad "Node.js — install 22 or newer from https://nodejs.org"; MISSING=1
fi

if command -v python3 >/dev/null 2>&1; then ok "Python $(python3 -V 2>&1 | cut -d' ' -f2)"; else bad "Python 3.11+ — install from https://python.org"; MISSING=1; fi

if command -v gh >/dev/null 2>&1; then
  ok "GitHub command line"
  if gh auth status >/dev/null 2>&1; then ok "signed in to GitHub"; else warn "not signed in — run: gh auth login"; fi
else
  warn "GitHub command line not installed (optional) — review requests will open in your browser instead"
fi

if [ "$MISSING" -ne 0 ]; then
  echo
  echo "Install the missing tools above, then run this again."
  exit 1
fi

echo
echo "Switching on the safety checks"
bash scripts/setup-hooks.sh
ok "checks will run before every save"

# The Python test harness is stdlib-only, so there is nothing to install. pytest is
# optional: the tests are unittest classes, which both runners collect.
if python3 -c "import pytest" >/dev/null 2>&1; then
  ok "pytest found — it will be used for Python tests"
else
  ok "using Python's built-in test runner (nothing to install)"
fi

if [ ! -f setup/reviewers.json ]; then
  warn "no reviewers configured yet — run: bash setup/configure-gh.sh"
fi

echo
echo "Running the checks once to prove it works"
node scripts/verify-all.mjs

echo
echo "Done. Day to day you only need:"
echo "  npm run status    what is going on"
echo "  npm run start     begin a piece of work"
echo "  npm run check     run the checks"
echo "  npm run save      save and upload"
echo "  npm run ship      ask for review"

#!/usr/bin/env bash
# Point git at ./hooks. Run once per clone.
set -euo pipefail
REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"
git config core.hooksPath hooks
chmod +x hooks/* scripts/*.sh 2>/dev/null || true
echo "git hooks path -> ./hooks (pre-commit skill gate active)"

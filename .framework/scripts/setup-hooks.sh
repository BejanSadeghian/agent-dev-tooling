#!/usr/bin/env bash
# Point git at .framework/hooks. Run once per clone.
set -euo pipefail
REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"
git config core.hooksPath .framework/hooks
chmod +x .framework/hooks/* .framework/scripts/*.sh 2>/dev/null || true
echo "git hooks path -> .framework/hooks (pre-commit skill gate active)"

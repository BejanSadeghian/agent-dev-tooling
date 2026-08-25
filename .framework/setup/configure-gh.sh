#!/usr/bin/env bash
# Sets up GitHub so review requests go to the right people automatically.
#
#   bash .framework/setup/configure-gh.sh                    # asks who the reviewers are
#   bash .framework/setup/configure-gh.sh alice bob          # sets them straight away
#   bash .framework/setup/configure-gh.sh --team org/skills  # a whole team instead
#   bash .framework/setup/configure-gh.sh --protect          # also require review before merging (needs admin)
#
# What it writes:
#   .framework/setup/reviewers.json   the list `npm run ship` asks for
#   .github/CODEOWNERS     so GitHub adds them to every pull request by itself
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

PROTECT=0
TEAM=""
REVIEWERS=()

while [ $# -gt 0 ]; do
  case "$1" in
    --protect) PROTECT=1 ;;
    --team) TEAM="$2"; shift ;;
    -*) echo "unknown option: $1" >&2; exit 2 ;;
    *) REVIEWERS+=("$1") ;;
  esac
  shift
done

if ! command -v gh >/dev/null 2>&1; then
  echo "The GitHub command line tool is not installed."
  echo "  macOS:    brew install gh"
  echo "  Windows:  winget install GitHub.cli"
  echo "  Linux:    see https://github.com/cli/cli#installation"
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "You are not signed in to GitHub. Starting sign-in..."
  gh auth login
fi

REPO="$(gh repo view --json nameWithOwner -q .nameWithOwner)"
echo "Repository: $REPO"
gh repo set-default "$REPO" >/dev/null 2>&1 || true

if [ ${#REVIEWERS[@]} -eq 0 ] && [ -z "$TEAM" ]; then
  echo
  echo "Who should review your work? GitHub usernames, separated by spaces."
  echo "(Press enter to skip — you can run this again later.)"
  read -r -p "> " -a REVIEWERS || true
fi

OWNER="${REPO%%/*}"
if [ -n "$TEAM" ]; then
  ENTRIES="\"@${TEAM}\""
  CODEOWNER_LINE="* @${TEAM}"
  JSON_REVIEWERS=""
else
  JSON_REVIEWERS="$(printf '"%s",' "${REVIEWERS[@]:-}" | sed 's/,$//')"
  CODEOWNER_LINE="* $(printf '@%s ' "${REVIEWERS[@]:-}")"
fi

mkdir -p .github
cat > .framework/setup/reviewers.json <<JSON
{
  "_comment": "Who gets asked to review. Used by 'npm run ship' and by .github/workflows/add-reviewers.yml.",
  "reviewers": [${JSON_REVIEWERS}],
  "teams": [$([ -n "$TEAM" ] && printf '"%s"' "$TEAM")]
}
JSON

cat > .github/CODEOWNERS <<OWNERS
# GitHub asks these people to review every pull request automatically.
# Regenerate with: bash .framework/setup/configure-gh.sh
${CODEOWNER_LINE}
OWNERS

echo
echo "Wrote .framework/setup/reviewers.json and .github/CODEOWNERS"

if [ "$PROTECT" -eq 1 ]; then
  echo "Requiring a review before anything can be merged into main..."
  gh api -X PUT "repos/${REPO}/branches/main/protection" \
    -H "Accept: application/vnd.github+json" \
    -f "required_status_checks[strict]=true" \
    -F "required_status_checks[contexts][]=format · rubric · regression" \
    -F "enforce_admins=false" \
    -F "required_pull_request_reviews[required_approving_review_count]=1" \
    -F "restrictions=" >/dev/null && echo "  done" || {
      echo "  could not set branch protection — you may not be an admin of this repository."
      echo "  Ask an admin to require 1 approving review on main."
    }
fi

echo
echo "From now on: npm run ship  will open the review request and ask them for you."

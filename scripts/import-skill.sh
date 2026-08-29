#!/usr/bin/env bash
# Import the security-code-review skill from your public GitHub repo.
set -euo pipefail

: "${PR_GUARD_REPO_URL:?Set PR_GUARD_REPO_URL e.g. https://github.com/you/pr-guard}"
BASE="${TRUEFORGE_URL:-http://localhost:8790}"

curl -sf -X POST "$BASE/api/v1/settings/skills" \
  -H "Content-Type: application/json" \
  -d "$(jq -n \
    --arg url "$PR_GUARD_REPO_URL" \
    '{
      manifest: {
        type: "git",
        name: "security-code-review",
        url: $url,
        path: "skills/security-code-review",
        ref: "main",
        description: "Gate-based security review checklist for pull request diffs."
      }
    }')" | jq .

echo "Skill registered from $PR_GUARD_REPO_URL"

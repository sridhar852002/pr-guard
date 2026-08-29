#!/usr/bin/env bash
# Apply insecure PR branch locally so you can preview the fixture diff before pushing.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FIXTURE="$ROOT/demo/vulnerable-api"

cd "$FIXTURE"
git init -q 2>/dev/null || true
git checkout -B main 2>/dev/null || git checkout -b main
git add -A
git commit -q -m "Initial fixture (safe baseline)" --allow-empty 2>/dev/null || git commit -q -m "Initial fixture (safe baseline)"

git checkout -B feat/insecure-login
git apply "$FIXTURE/PATCH-insecure-login.diff"
git add -A
git commit -m "Add admin endpoint and config (intentionally insecure for demo)"

echo "Fixture branch ready at $FIXTURE (branch feat/insecure-login)"
echo "Push to GitHub and open a PR — see demo/vulnerable-api/README.md"

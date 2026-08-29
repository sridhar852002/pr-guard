#!/usr/bin/env bash
# Build fixture repo in a temp dir and push to GitHub for demo PRs.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/demo/vulnerable-api"
WORK="$(mktemp -d)"
GITHUB_USER="${GITHUB_USER:-sridhar852002}"
REPO_NAME="${FIXTURE_REPO_NAME:-vulnerable-api-fixture}"

cleanup() { rm -rf "$WORK"; }
trap cleanup EXIT

cp -r "$SRC/package.json" "$SRC/README.md" "$SRC/src" "$SRC/tests" "$WORK/"
rm -rf "$WORK/.git" 2>/dev/null || true

cd "$WORK"
npm test

git init -q
git checkout -b main
git add -A
git commit -q -m "Initial fixture (safe baseline)"

git checkout -b feat/insecure-login

cat > src/config.js <<'EOF'
/** Intentionally bad for PR Guard demo — do not copy. */
module.exports = {
  apiKey: 'sk-demo-7f3a9b2c1d4e5f6a',
  adminBypass: true,
};
EOF

cat > src/login.js <<'EOF'
const users = [{ id: 1, username: 'alice', password: 'secret123' }];
const { apiKey } = require('./config.js');

/** Demo-only login — the PR branch makes this worse on purpose. */
function findUser(username) {
  // Intentional injection pattern for demo: user input in query string
  const query = "SELECT * FROM users WHERE username = '" + username + "'";
  return users.find((u) => query.includes(u.username));
}

function login(username, password) {
  const user = findUser(username);
  if (!user || user.password !== password) {
    return { ok: false };
  }
  return { ok: true, token: `demo-${user.id}`, apiKey };
}

function adminAction(_req) {
  // Intentional: no auth check on destructive admin path
  return { deleted: true, scope: 'all_users' };
}

module.exports = { login, findUser, adminAction };
EOF

cat >> tests/login.test.js <<'EOF'

test('admin action returns success (tests do not cover auth)', () => {
  const { adminAction } = require('../src/login.js');
  assert.equal(adminAction({}).deleted, true);
});
EOF

npm test
git add -A
git commit -q -m "Add admin endpoint and config (intentionally insecure for demo)"

if gh repo view "$GITHUB_USER/$REPO_NAME" >/dev/null 2>&1; then
  echo "Repo exists — force-pushing branches..."
  git remote add origin "https://github.com/$GITHUB_USER/$REPO_NAME.git" 2>/dev/null || git remote set-url origin "https://github.com/$GITHUB_USER/$REPO_NAME.git"
  git push -f origin main feat/insecure-login
else
  gh repo create "$GITHUB_USER/$REPO_NAME" --public \
    --description "Demo fixture for PR Guard hackathon agent (intentional vulns)" \
    --source=. --remote=origin --push
  git push -u origin feat/insecure-login
fi

PR_URL=$(gh pr list --repo "$GITHUB_USER/$REPO_NAME" --head feat/insecure-login --json url -q '.[0].url' 2>/dev/null || true)
if [[ -z "$PR_URL" ]]; then
  PR_URL=$(gh pr create --repo "$GITHUB_USER/$REPO_NAME" \
    --base main --head feat/insecure-login \
    --title "Add admin endpoint and config (demo vulns)" \
    --body "Intentionally insecure changes for PR Guard hackathon demo. Do not merge to production." \
    2>&1)
fi

echo ""
echo "Fixture repo: https://github.com/$GITHUB_USER/$REPO_NAME"
echo "Demo PR:      $PR_URL"
echo ""
echo "Use in TrueForge chat:"
echo "  Review this pull request end to end: $PR_URL"

# vulnerable-api-fixture

**Demo-only.** Push this folder to its own public GitHub repo, open a PR from `feat/insecure-login`,
and point PR Guard at that PR URL for a reliable hackathon demo.

The PR branch intentionally adds:

- Hardcoded API key in `src/config.js`
- SQL-style string concatenation in `src/login.js` (injection pattern)
- Missing auth check on a new `/admin` handler

Tests still pass — PR Guard should catch security issues the tests miss.

## Create the demo PR

```bash
cd demo/vulnerable-api
git init
git checkout -b main
git add .
git commit -m "Initial fixture"
git checkout -b feat/insecure-login
# apply the diff from PATCH-insecure-login.diff in this folder
git add .
git commit -m "Add admin endpoint and config (intentionally insecure for demo)"
git push -u origin main
git push -u origin feat/insecure-login
# Open PR on GitHub: feat/insecure-login → main
```

Or run `../../scripts/create-fixture-pr.sh` after setting `GITHUB_USER`.

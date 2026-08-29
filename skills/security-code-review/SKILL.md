---
name: security-code-review
description: Gate-based checklist for reviewing a pull request's diff for common vulnerability classes, with severity-ranked, defensible findings.
---

# Security Code Review Skill

Use this skill when reviewing a diff or pull request for security issues. Walk every gate below
against the **changed lines only** — this is a diff review, not a full-repo audit. For each gate,
write one line: `PASS`, `FINDING`, or `N/A`. A `FINDING` requires a specific `file:line` and a
one-sentence justification of concrete impact. An untestable suspicion is not a finding — if you
can't point to the exact line and explain what an attacker gains, it doesn't go in the review.

## Gates

1. **Input validation** — Is user-controlled input validated or sanitized before it's used in a
   query, command, path, or template?
2. **Authentication & authorization** — Does every new or changed endpoint/handler check that the
   caller is who they claim, and is allowed to perform this specific action?
3. **Injection** — SQL, command, template, or log injection: is any input concatenated into a
   query, command, or format string instead of parameterized or escaped?
4. **Secrets handling** — Are credentials, tokens, or keys hardcoded, logged, or committed instead
   of pulled from a secret store or environment variable?
5. **Deserialization & parsing** — Is untrusted data deserialized or parsed with a method that can
   execute code (e.g. unsafe pickle, `yaml.load`, `eval`)?
6. **Path & file handling** — Can a path built from user input escape its intended directory
   (path traversal)?
7. **SSRF & outbound requests** — Can user input control a URL or host that the server then
   fetches from?
8. **Dependency changes** — Does the diff add or bump a dependency? Note it, but don't speculate
   about vulnerabilities you haven't confirmed exist in that exact version.
9. **Error handling & information disclosure** — Do new error paths leak stack traces, internal
   paths, or sensitive data to the caller?

## Severity

- **High** — directly exploitable, no special access required, clear impact (data exposure, RCE,
  auth bypass).
- **Medium** — exploitable under specific conditions, or impact is limited.
- **Low** — a real weakness but hard to exploit, or defense-in-depth.

When uncertain between two tiers, use the lower one and say why in the justification. Rank
conservatively — an inflated severity is worse than a missed low-severity note.

## Output shape

This checklist feeds a single review body — the agent posts one review comment for the whole PR,
not one inline comment per finding (GitHub's per-line comment tool has a known bug where it can
silently fail on lines outside the diff, so this skill is written to avoid it entirely). For each
gate with a finding, write one line:

```
[SEVERITY] gate name — file:line — one-sentence justification — one-sentence suggested fix.
```

Gates that pass or don't apply don't need their own line in the final comment — summarize them in
one line ("no findings on auth, injection, secrets, or SSRF") so the review stays readable.

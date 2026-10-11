---
name: secret-scan
description: Scan staged changes, a branch diff, or the whole repo for leaked secrets (API keys, tokens, private keys, passwords) and forbidden files (project.secrets.json, .env, key files) before committing or opening a PR. Use before any commit/push/PR, or when the user asks to check for secrets or credentials in the code.
---

# secret-scan — catch secrets before they reach git

A dependency-free Python script that scans **added lines** of a git diff (or every tracked file)
against known token formats plus a generic `password = "…"` rule, and flags files that must never be
committed.

## How to run

The script sits in this skill's folder: `.claude/skills/secret-scan/` (Claude) or
`.agents/skills/secret-scan/` (Codex). Run it from the repo root:

```bash
python3 <skill-dir>/scan_secrets.py              # staged changes (default) — before a commit
python3 <skill-dir>/scan_secrets.py --base main  # everything this branch adds since main — before a PR
python3 <skill-dir>/scan_secrets.py --worktree   # staged + unstaged changes vs HEAD
python3 <skill-dir>/scan_secrets.py --all-files  # every tracked file — first-time audit
```

Add `--json` for machine-readable output. Exit code `0` = clean, `1` = findings, `2` = git error.

## What to do with the result

1. **Clean** → continue with the commit/PR.
2. **Findings** → do **not** commit. For each finding:
   - A real secret → remove it from the change, read it from the environment or the project's
     secrets mechanism instead (in a 4PM project: `project.secrets.json`, git-ignored, referenced by
     placeholder — see `AI_PLACEHOLDER.md`), and tell the user the secret must be **rotated** if it was
     ever pushed.
   - A forbidden file → unstage it (`git restore --staged <path>`) and make sure it is git-ignored.
   - A false positive (test fixture, documented example) → prefer a clear placeholder value
     (`<your-api-key>`, `${API_KEY}`); only if that is impossible, append the comment
     `secret-scan: allow` on that line with a short reason.
3. Re-run until clean, then report what was found and changed.

## Notes

- Findings are masked (first 4 chars + length) so the scan output never re-leaks the value.
- Placeholders such as `${VAR}`, `{{VAR}}`, `<value>`, `changeme`, `xxxx` are ignored.
- Template files (`.sample`, `.example`, `.template`) of forbidden files are allowed.
- This is a fast pre-commit net, not a full audit; it does not scan git history.

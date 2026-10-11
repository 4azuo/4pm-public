---
name: check-usage
description: Show Claude Code plan usage limits — current session % and reset time, weekly % and reset time (same data as the built-in /usage screen). Use when the user asks how much usage is left, when the limit resets, or to check usage/quota/limits.
---

# check-usage — Claude Code plan usage limits

Fetches the same data the built-in `/usage` screen shows (session + weekly utilization and reset
times) by calling the Anthropic OAuth usage endpoint with the local Claude Code credentials.

## How to run

Run the bundled script with the Bash tool and relay its output to the user:

```bash
python3 .claude/skills/check-usage/check_usage.py
```

On Windows, if `python3` is missing, try `py .claude/skills/check-usage/check_usage.py`.

Add `--json` to print the raw API response instead of the formatted view.

## Output file

Every formatted run rewrites `output/last-usage-check.json` next to the script with
machine-readable fields: `session_pct`, `weekly_pct`, `session_resets_at`, `weekly_resets_at`,
`checked_at`, `plan`, the human `summary`, and the full `raw` payload. The folder is git-ignored.

## Notes

- Reads the OAuth access token from `~/.claude/.credentials.json` (Claude Code keeps it refreshed).
- On failure the script runs `claude /usage` once to refresh the token, then retries once.
- Reset times are printed in the machine's local timezone.
- Never print or log the access token.

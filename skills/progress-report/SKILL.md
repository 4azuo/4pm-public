---
name: progress-report
description: Write a progress report (daily by default, or any date range) into reports/ from real git activity — commits per branch, contributors, size of change — plus the tasks the 4PM autonomous books mark as done. Use when the user asks for a daily/weekly report, a standup summary, "what changed since …", or a progress update.
---

# progress-report — fact-based progress reports

The bundled script gathers **facts** from git; you turn them into a short report. Never claim work
that is not in the collected data.

## Steps

1. **Window.** Default: the last day. Use the user's range if given (`--since 2026-10-01 --until
   2026-10-07`, or `--since "1 week ago"`).
2. **Collect.** From the repo root, run the script in this skill's folder
   (`.claude/skills/progress-report/` for Claude, `.agents/skills/progress-report/` for Codex):

   ```bash
   git fetch --all --prune --quiet   # optional, when remote branches matter
   python3 <skill-dir>/collect_progress.py --since "1 day ago"
   ```

   Add `--branch <name>` (repeatable) to limit branches.
3. **Done tasks (4PM projects).** If `booksBranches` is not empty, read the done book from that
   branch without checking it out, e.g. `git show autonomous-books/main:AI_DONE.md`, and keep the rows
   finished inside the window. If there is no books branch, read `AI_DONE.md` in the working tree if
   it exists.
4. **Write** `reports/progress-<YYYY-MM-DD>.md` (date = end of the window; for a range use
   `progress-<from>_<to>.md`) with these sections:
   - **Summary** — 2–4 sentences: what moved forward, what is blocked.
   - **Done** — finished tasks (IDs from `AI_DONE.md`) and merged work, grouped by feature/area.
   - **In progress** — active branches with their latest commit subjects.
   - **Numbers** — commits, lines added/deleted, contributors.
   - **Risks / blockers** — only those evidenced by the data (reverts, failing-fix chains, stale
     branches) or stated in `USER_QA.md`.
5. **Report back** with the file path and the summary paragraph. Do not commit the report unless the
   user asks.

## Notes

- Merge commits are excluded; a commit reachable from several branches is counted once (first branch).
- Keep the report in the language the user writes in.

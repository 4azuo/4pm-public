---
description: Draft a Conventional Commits message for the staged changes
argument-hint: "[optional scope or hint]"
---

Draft a commit message for the **staged** changes. Do not commit and do not change any file.

1. Run `git diff --cached --stat` and `git diff --cached` to see what is staged. If nothing is staged,
   say so and stop.
2. Read `CLAUDE.md` / `AGENTS.md` for any commit-message convention of this repository and follow it
   over the defaults below.
3. Write the message in Conventional Commits form:
   - subject: `<type>(<scope>): <summary>` — type one of `feat`, `fix`, `docs`, `refactor`, `test`,
     `chore`, `perf`, `build`, `ci`; imperative mood, ≤ 72 characters, no trailing period;
   - a blank line, then a short body explaining **why** the change was made and anything a reviewer
     must know (breaking changes as `BREAKING CHANGE: …`).
4. Use this hint if given: $ARGUMENTS

Reply with only the commit message in a fenced code block, followed by one line suggesting the
`git commit` command to run.

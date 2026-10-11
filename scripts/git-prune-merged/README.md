# git-prune-merged

Deletes **local** branches that are already merged into the base branch. Dry run by default.

```bash
bash .4pm/scripts/git-prune-merged/prune-merged.sh            # list what would be deleted
bash .4pm/scripts/git-prune-merged/prune-merged.sh --apply    # delete them
bash .4pm/scripts/git-prune-merged/prune-merged.sh --base develop --no-fetch
```

- Base = origin's default branch (else `main`, else `master`); merges are checked against
  `origin/<base>` when it exists, after a `git fetch --prune`.
- Never touches the current branch, the base, `main`/`master`/`develop`, `release/*` or the 4PM
  books branches `autonomous-books/*`.
- Uses `git branch -d` (safe delete) — remote branches are never deleted.
- Requires bash (Linux/macOS, or Git Bash/WSL on Windows).

Pair with the VS Code task package `git-prune-merged` to run it from **Terminal → Run Task**.

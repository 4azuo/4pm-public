#!/usr/bin/env bash
# Delete local git branches already merged into the base branch.
# Dry run by default — prints what would be deleted; pass --apply to delete.
#
# Usage: prune-merged.sh [--apply] [--base <branch>] [--no-fetch]
#   --base      branch to compare against (default: origin's HEAD branch, else main, else master)
#   --no-fetch  skip `git fetch --prune` (offline)
# Never deletes: the current branch, the base, main/master/develop, release/*, autonomous-books/*.
set -euo pipefail

apply=0
base=""
fetch=1
while [[ $# -gt 0 ]]; do
  case "$1" in
    --apply) apply=1 ;;
    --base) base="${2:?--base needs a branch}"; shift ;;
    --no-fetch) fetch=0 ;;
    -h|--help) sed -n '2,8p' "$0"; exit 0 ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
  shift
done

git rev-parse --is-inside-work-tree >/dev/null 2>&1 || { echo "not a git repository" >&2; exit 2; }

if [[ $fetch -eq 1 ]] && git remote get-url origin >/dev/null 2>&1; then
  git fetch --prune --quiet origin || echo "warning: fetch failed, using local refs" >&2
fi

if [[ -z "$base" ]]; then
  base="$(git symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null | sed 's#^origin/##' || true)"
  for candidate in "$base" main master; do
    if [[ -n "$candidate" ]] && git show-ref --verify --quiet "refs/heads/$candidate"; then base="$candidate"; break; fi
  done
fi
git show-ref --verify --quiet "refs/heads/$base" || { echo "base branch not found: $base" >&2; exit 2; }

# Compare against the remote base when it exists, so merges done on the server count.
target="$base"
git show-ref --verify --quiet "refs/remotes/origin/$base" && target="origin/$base"

current="$(git symbolic-ref --quiet --short HEAD || true)"
mapfile -t merged < <(git for-each-ref --format='%(refname:short)' --merged "$target" refs/heads)

candidates=()
for b in "${merged[@]}"; do
  case "$b" in
    "$base"|"$current"|main|master|develop|release/*|autonomous-books/*) continue ;;
  esac
  candidates+=("$b")
done

if [[ ${#candidates[@]} -eq 0 ]]; then
  echo "No merged branches to prune (base: $target)."
  exit 0
fi

echo "Branches merged into $target:"
printf '  %s\n' "${candidates[@]}"

if [[ $apply -eq 0 ]]; then
  echo
  echo "Dry run — re-run with --apply to delete these ${#candidates[@]} branch(es)."
  exit 0
fi

for b in "${candidates[@]}"; do
  git branch -d "$b"
done
echo "Deleted ${#candidates[@]} branch(es)."

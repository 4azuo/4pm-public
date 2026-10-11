#!/usr/bin/env python3
"""Collect git facts for a progress report over a time window.

Prints JSON: the window, per-branch commits (hash, author, date, subject, files, +/-), totals,
contributors, and the 4PM autonomous books branches found. The skill turns this into prose; this
script only gathers facts so the report never invents work.

Usage:
  collect_progress.py [--since "1 day ago" | --since 2026-10-01] [--until now] [--branch main]...
Defaults: --since "1 day ago", every local + remote branch.
"""
import argparse
import json
import subprocess
import sys

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8")
    except Exception:
        pass

FIELD = "\x1f"
RECORD = "\x1e"


def git(*args):
    """Run a git command and return stdout; exit 2 on failure."""
    try:
        return subprocess.run(["git", *args], check=True, capture_output=True, text=True,
                              encoding="utf-8", errors="replace").stdout
    except FileNotFoundError:
        sys.exit("git not found")
    except subprocess.CalledProcessError as e:
        print(f"git {' '.join(args)} failed: {e.stderr.strip()}", file=sys.stderr)
        sys.exit(2)


def list_branches():
    """Local + remote branch names, without the symbolic origin/HEAD."""
    out = git("for-each-ref", "--format=%(refname:short)", "refs/heads", "refs/remotes")
    return [b for b in out.splitlines() if b and not b.endswith("/HEAD") and b != "origin"]


def commits(branch, since, until):
    """Commits reachable from a branch in the window, with numstat totals."""
    # The record mark leads each entry: git prints the numstat lines after the formatted header.
    fmt = RECORD + FIELD.join(["%H", "%an", "%aI", "%s"])
    out = git("log", branch, f"--since={since}", f"--until={until}", "--no-merges",
              f"--format={fmt}", "--numstat")
    result = []
    for chunk in out.split(RECORD):
        chunk = chunk.strip("\n")
        if not chunk:
            continue
        head, _, stats = chunk.partition("\n")
        parts = head.split(FIELD)
        if len(parts) != 4:
            continue
        files, added, deleted = [], 0, 0
        for line in stats.splitlines():
            cols = line.split("\t")
            if len(cols) == 3:
                files.append(cols[2])
                added += int(cols[0]) if cols[0].isdigit() else 0
                deleted += int(cols[1]) if cols[1].isdigit() else 0
        result.append({"hash": parts[0][:10], "author": parts[1], "date": parts[2],
                       "subject": parts[3], "files": files, "added": added, "deleted": deleted})
    return result


def main():
    ap = argparse.ArgumentParser(description="Collect git progress facts as JSON.")
    ap.add_argument("--since", default="1 day ago")
    ap.add_argument("--until", default="now")
    ap.add_argument("--branch", action="append", help="limit to these branches (repeatable)")
    args = ap.parse_args()

    branches = args.branch or list_branches()
    seen, per_branch = set(), {}
    for b in branches:
        rows = [c for c in commits(b, args.since, args.until) if c["hash"] not in seen]
        for c in rows:
            seen.add(c["hash"])
        if rows:
            per_branch[b] = rows

    all_commits = [c for rows in per_branch.values() for c in rows]
    contributors = {}
    for c in all_commits:
        contributors[c["author"]] = contributors.get(c["author"], 0) + 1

    print(json.dumps({
        "window": {"since": args.since, "until": args.until},
        "totals": {
            "commits": len(all_commits),
            "added": sum(c["added"] for c in all_commits),
            "deleted": sum(c["deleted"] for c in all_commits),
        },
        "contributors": contributors,
        "booksBranches": [b for b in list_branches() if "autonomous-books/" in b],
        "branches": per_branch,
    }, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()

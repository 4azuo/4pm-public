#!/usr/bin/env python3
"""Scan git changes for leaked secrets and forbidden files before a commit/PR.

Modes (pick one; default --staged):
  --staged          lines added in the staged diff (git diff --cached)
  --base <ref>      lines added on this branch since <ref> (git diff <ref>...HEAD)
  --worktree        lines added in unstaged + staged changes vs HEAD
  --all-files       every line of every tracked file (slow; first-time audit)

Output: one finding per line `path:line  rule  masked-snippet`, or `--json`.
Exit code: 0 = clean, 1 = findings, 2 = usage/git error.

A line containing `secret-scan: allow` is skipped (use sparingly, explain why next to it).
"""
import argparse
import json
import re
import subprocess
import sys

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8")
    except Exception:
        pass

# (rule id, compiled regex). Ordered from most to least specific.
RULES = [
    ("private-key", re.compile(r"-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY-----")),
    ("aws-access-key", re.compile(r"\b(?:AKIA|ASIA)[0-9A-Z]{16}\b")),
    ("github-token", re.compile(r"\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}\b|\bgithub_pat_[A-Za-z0-9_]{60,}\b")),
    ("gitlab-token", re.compile(r"\bglpat-[A-Za-z0-9_-]{20,}\b")),
    ("slack-token", re.compile(r"\bxox[abposr]-[A-Za-z0-9-]{10,}\b")),
    ("stripe-live-key", re.compile(r"\b(?:sk|rk)_live_[A-Za-z0-9]{20,}\b")),
    ("google-api-key", re.compile(r"\bAIza[0-9A-Za-z_-]{35}\b")),
    ("anthropic-key", re.compile(r"\bsk-ant-[A-Za-z0-9_-]{20,}\b")),
    ("openai-key", re.compile(r"\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{32,}\b")),
    ("jwt", re.compile(r"\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b")),
    ("url-credentials", re.compile(r"\b[a-z][a-z0-9+.-]*://[^/\s:@]+:[^/\s:@]{6,}@")),
    ("generic-assignment", re.compile(
        r"(?i)\b(?:password|passwd|pwd|secret|api[_-]?key|access[_-]?key|auth[_-]?token|token|client[_-]?secret)"
        r"\b\s*[:=]\s*[\"']([^\"'\s]{8,})[\"']")),
]

# Files that must never be committed, matched against the repo-relative path.
FORBIDDEN_PATHS = [
    ("secrets-file", re.compile(r"(?:^|/)project\.secrets\.json$")),
    ("dotenv", re.compile(r"(?:^|/)\.env(?:\.[A-Za-z0-9_-]+)?$")),
    ("key-file", re.compile(r"(?:^|/)(?:id_rsa|id_ed25519|id_ecdsa)$|\.(?:pem|p12|pfx|key)$")),
    ("claude-credentials", re.compile(r"(?:^|/)\.credentials\.json$")),
]
# Template/sample variants of forbidden files are fine.
SAFE_SUFFIXES = (".sample", ".example", ".template", ".sample.json", ".example.json", ".dist")

# Values that are obviously placeholders, not real secrets.
PLACEHOLDER = re.compile(
    r"^(?:\$\{[^}]*\}|\{\{[^}]*\}\}|<[^>]*>|%[^%]*%|x{4,}|\*{4,}|\.{3,}|"
    r"changeme|change-me|your[_-].*|example.*|dummy.*|test.*|placeholder.*|redacted)$",
    re.IGNORECASE,
)
ALLOW_MARK = "secret-scan: allow"


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


def added_lines_from_diff(diff_args):
    """Yield (path, line_no, text) for every added line of a unified diff with zero context."""
    out = git("diff", "--no-color", "--unified=0", "--no-ext-diff", *diff_args)
    path, line_no = None, 0
    for raw in out.splitlines():
        if raw.startswith("+++ "):
            target = raw[4:]
            path = None if target == "/dev/null" else target[2:] if target.startswith("b/") else target
        elif raw.startswith("@@"):
            m = re.search(r"\+(\d+)", raw)
            line_no = int(m.group(1)) if m else 0
        elif raw.startswith("+") and not raw.startswith("+++") and path:
            yield path, line_no, raw[1:]
            line_no += 1


def changed_paths(diff_args):
    """Paths added or modified by the diff (for the forbidden-file check)."""
    out = git("diff", "--name-only", "--diff-filter=AMR", *diff_args)
    return [p for p in out.splitlines() if p]


def all_tracked_lines():
    """Yield (path, line_no, text) for every line of every tracked text file."""
    for path in git("ls-files").splitlines():
        try:
            with open(path, "r", encoding="utf-8") as f:
                for i, text in enumerate(f, 1):
                    yield path, i, text.rstrip("\n")
        except (UnicodeDecodeError, IsADirectoryError, FileNotFoundError, PermissionError):
            continue


def mask(value):
    """Keep a few leading chars so the finding is recognisable without re-leaking it."""
    value = value.strip()
    return value[:4] + "…" + f"({len(value)} chars)" if len(value) > 8 else "…"


def scan_line(text):
    """Return [(rule, matched)] for a line, skipping allow-marked lines and placeholders."""
    if ALLOW_MARK in text:
        return []
    hits = []
    for rule, rx in RULES:
        for m in rx.finditer(text):
            value = m.group(1) if m.groups() else m.group(0)
            if rule == "generic-assignment" and PLACEHOLDER.match(value):
                continue
            hits.append((rule, value))
    return hits


def forbidden(path):
    """Return the forbidden-file rule a path matches, or None."""
    if path.endswith(SAFE_SUFFIXES):
        return None
    for rule, rx in FORBIDDEN_PATHS:
        if rx.search(path):
            return rule
    return None


def main():
    ap = argparse.ArgumentParser(description="Scan git changes for secrets.")
    mode = ap.add_mutually_exclusive_group()
    mode.add_argument("--staged", action="store_true")
    mode.add_argument("--base", metavar="REF")
    mode.add_argument("--worktree", action="store_true")
    mode.add_argument("--all-files", action="store_true")
    ap.add_argument("--json", action="store_true", help="print findings as JSON")
    args = ap.parse_args()

    if args.all_files:
        lines, paths = all_tracked_lines(), git("ls-files").splitlines()
    else:
        diff_args = [f"{args.base}...HEAD"] if args.base else ["HEAD"] if args.worktree else ["--cached"]
        lines, paths = added_lines_from_diff(diff_args), changed_paths(diff_args)

    findings = []
    for path in paths:
        rule = forbidden(path)
        if rule:
            findings.append({"path": path, "line": 0, "rule": rule, "snippet": "file must not be committed"})
    seen = set()
    for path, line_no, text in lines:
        for rule, value in scan_line(text):
            key = (path, line_no, rule)
            if key not in seen:
                seen.add(key)
                findings.append({"path": path, "line": line_no, "rule": rule, "snippet": mask(value)})

    if args.json:
        print(json.dumps({"clean": not findings, "findings": findings}, indent=2))
    elif findings:
        for f in findings:
            print(f"{f['path']}:{f['line']}  {f['rule']}  {f['snippet']}")
        print(f"\n{len(findings)} potential secret(s) found.")
    else:
        print("No secrets found.")
    sys.exit(1 if findings else 0)


if __name__ == "__main__":
    main()

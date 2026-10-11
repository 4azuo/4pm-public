# 4pm-public

Official skills, subagents, scripts and VS Code tasks published by **4PM** for everyone to use.
Every item here is available in the 4PM **Marketplace** with an **Official** badge, and can also be
copied by hand into any project.

| Item | Kind | What it does | Claude | Codex |
| --- | --- | --- | :-: | :-: |
| [`check-usage`](skills/check-usage) | skill | Claude Code plan usage — session/weekly % and reset times | ✓ | — |
| [`secret-scan`](skills/secret-scan) | skill | Scan changes for leaked secrets and forbidden files before committing | ✓ | ✓ |
| [`it-scenario`](skills/it-scenario) | skill | Create integration-test scenarios and test-case specs in the 4PM layout | ✓ | ✓ |
| [`progress-report`](skills/progress-report) | skill | Fact-based daily/range progress report from git + the done book | ✓ | ✓ |
| [`code-reviewer`](agents/code-reviewer) | subagent | Read-only reviewer that verifies and ranks findings | ✓ | ✓ |
| [`git-prune-merged`](scripts/git-prune-merged) | script | Delete local branches already merged into the base | — | — |
| [`git-prune-merged`](vscode-tasks/git-prune-merged) | VS Code task | Run the prune script from **Terminal → Run Task** (requires the script) | — | — |

## Install

**From 4PM (recommended):** open **Marketplace**, filter **Official**, pick an item and **Install**
into a project — choose Claude and/or Codex for skills/subagents. Updates show as a badge; local edits
are never overwritten.

**By hand** — copy the item folder (without `changelog.json`) to:

| Kind | Claude Code | Codex |
| --- | --- | --- |
| skill | `.claude/skills/<slug>/` | `.agents/skills/<slug>/` |
| subagent | `.claude/agents/<slug>.md` (= `agent.md`) | `.codex/agents/<slug>.toml` (= `agent.codex.toml`) |
| script | `.4pm/scripts/<slug>/` | same |
| VS Code task | merge the `tasks` entries into `.vscode/tasks.json` | same |

## Layout

```
registry.json            # index: kind, slug, path, name, description, version, category, tags, providers, requires
skills/<slug>/           # SKILL.md + helper files + changelog.json
agents/<slug>/           # agent.md (+ agent.codex.toml, memory) + changelog.json
scripts/<slug>/          # script files + README.md + changelog.json
vscode-tasks/<slug>/     # tasks.json ({ "tasks": [...] }) + changelog.json
tools/                   # validate.mjs · pack.mjs (Node >= 22, no dependencies)
```

## Contributing

See [`CLAUDE.md`](CLAUDE.md) for the item rules and the release flow. Run `node tools/validate.mjs`
before opening a PR.

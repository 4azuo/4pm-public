# CLAUDE.md — `4pm-public`

Official 4PM marketplace packages (decision: 4PM ADR-0459; kinds/targets: ADR-0460, bundles/commands/hooks:
ADR-0461, guides: ADR-0462). Outward-facing
overview: [`README.md`](README.md). Everything here is **English**.

## Items

- One folder per item under `skills/`, `agents/`, `scripts/`, `vscode-tasks/`, `commands/`, `hooks/`, `guides/` or
  `bundles/`; the folder name is the
  **slug** (`[\w.-]+`). The same slug may exist under two kinds (e.g. a script and its VS Code task).
- Every item is listed in **`registry.json`** (`kind`, `slug`, `path`, `name`, `description`,
  `version`, `category`, `tags`, optional `providers`, `requires`). `category` is one of the market's
  seeded slugs: `coding · review · devops · data · docs · testing · product · other`.
- Every item folder has its own **`changelog.json`** — newest first:
  `[{ "version": "1.1.0", "date": "YYYY-MM-DD", "changes": ["…"] }]`. It is not shipped in the
  package payload.
- Payload rules per kind:
  - **skill** — `SKILL.md` whose frontmatter `name` = slug, plus helper files. Skills that list
    `codex` in `providers` must work from both `.claude/skills/<slug>/` and `.agents/skills/<slug>/`
    — refer to bundled files relative to the skill folder, never a hard-coded `.claude/` path.
  - **subagent** — `agent.md` (frontmatter `name` = slug) and optional `short-memory.md` /
    `long-memory.md`; listing `codex` requires an author-written `agent.codex.toml` (`name` = slug,
    `description`, `developer_instructions`). Keep the two prompts in sync.
  - **script** — any files; include a `README.md` with usage. Installed to `.4pm/scripts/<slug>/`.
  - **vscode-task** — exactly one `tasks.json` holding only `{ "tasks": [...] }`; labels unique across
    all items (prefix them `4pm: `); **never** `runOptions.runOn: "folderOpen"`. Reference scripts by
    their installed path and declare them in `requires` (`"script:<slug>"`).
  - **command** — exactly one `command.md` (Claude slash command; Claude-only — for Codex publish a skill).
  - **hook** — `hook.json` = `{ "hooks": { "<Event>": [{ "matcher"?, "hooks": [{ "type": "command",
    "command", "timeout"? }] }] } }` + its scripts; write `{{hookDir}}` for the installed script folder. Hooks
    run automatically on agent events — keep them small, fast, dependency-free and fail-open on bad input;
    to block, print the reason to stderr and exit 2 (and `{"decision":"block","reason"}` on stdout for Codex).
  - **guide** — exactly one `GUIDE.md`, written generically (no repo-specific paths); users apply it with
    Adapt with AI. Keep the `AI_SECURITY.md` rule. Never part of a bundle.
  - **bundle** — `bundle.json` listing ≥ 2 member items `<kind>:<slug>` (no guides, no bundles); `pack.mjs`
    copies the members' current files, so bump the bundle's version whenever a member changes.
- Scripts must be safe by default (dry run unless a flag says otherwise), dependency-free where
  possible (Python 3 stdlib, bash, Node built-ins), and must never print secrets.

## Changing an item

1. Edit the files, bump `version` in `registry.json` (semver), and add the new entry at the **top** of
   the item's `changelog.json` with the same version.
2. `node tools/validate.mjs` must pass (CI runs it plus `py_compile` / `bash -n` and a dry-run pack).
3. Never rewrite a released version — always bump.

## Release

From the 4PM monorepo run the VS Code task **`public: release`** (`41-scripts/release-public.sh`): it checks
this repo is clean and pushed, validates, lists what changed since the last tag (and items changed without a
version bump), then pushes the next free tag. By hand: push a tag `vYYYY.MM.DD` (add `.N` for a second release that day). `release.yml` validates, runs
`tools/pack.mjs`, and publishes `<kind>--<slug>--<version>.zip` + the release `registry.json` as
GitHub Release assets. 4PM picks it up when the market-server's `OFFICIAL_PACKAGES_REF` is set to that
tag (the seed only adds versions it does not have yet).

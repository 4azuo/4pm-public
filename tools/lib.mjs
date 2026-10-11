/**
 * Shared helpers for the 4pm-public tools: load + validate the registry, each item's changelog and
 * payload shape, and list an item's payload files. No dependencies (Node >= 22).
 * Rules mirror the 4PM marketplace (ADR-0185 manifest, ADR-0459 repo layout, ADR-0460/0461/0462 kinds).
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

/** Repo root (the parent of tools/). */
export const ROOT = fileURLToPath(new URL("..", import.meta.url));

/** Item kind → top-level folder. */
export const KIND_DIRS = {
  skill: "skills",
  subagent: "agents",
  script: "scripts",
  "vscode-task": "vscode-tasks",
  command: "commands",
  hook: "hooks",
  guide: "guides",
  bundle: "bundles",
};
/** Kinds a bundle may contain (no guide, no nested bundle). */
export const BUNDLE_MEMBER_KINDS = ["skill", "subagent", "script", "vscode-task", "command", "hook"];
/** Kinds whose install is per provider. */
export const PROVIDER_KINDS = ["skill", "subagent", "hook"];
/** Hook event names. */
const EVENT_RE = /^[A-Za-z][A-Za-z0-9]{0,63}$/;
/** Providers a skill/subagent may target. */
export const PROVIDERS = ["claude", "codex"];
/** Seeded marketplace category slugs (market-server MarketCategorySeedService). */
export const CATEGORIES = ["coding", "review", "devops", "data", "docs", "testing", "product", "other"];
/** Files kept in an item folder but never shipped in the package payload. */
export const NON_PAYLOAD = new Set(["changelog.json", ".DS_Store"]);

const SLUG_RE = /^[\w.-]+$/;
const SEMVER_RE = /^\d+\.\d+\.\d+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Compare two semvers: negative if a<b, 0 if equal, positive if a>b. */
export function compareSemver(a, b) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
  return 0;
}

/** Read and parse a JSON file relative to the root. */
export function readJson(rel) {
  return JSON.parse(readFileSync(join(ROOT, rel), "utf8"));
}

/** Every payload file of an item folder, as sorted POSIX paths relative to it. */
export function payloadFiles(itemPath) {
  const base = join(ROOT, itemPath);
  const out = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.isFile() && !NON_PAYLOAD.has(e.name)) out.push(relative(base, full).split(sep).join("/"));
    }
  };
  walk(base);
  return out.sort();
}

/** The `name:` value of a Markdown file's YAML frontmatter, or null. */
function frontmatterName(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!m) return null;
  const line = m[1].split(/\r?\n/).find((l) => l.startsWith("name:"));
  return line ? line.slice(5).trim().replace(/^["']|["']$/g, "") : null;
}

/** Validate one item's changelog.json; pushes errors and returns the parsed entries. */
function checkChangelog(item, errors) {
  const rel = `${item.path}/changelog.json`;
  if (!existsSync(join(ROOT, rel))) {
    errors.push(`${rel}: missing`);
    return [];
  }
  let log;
  try {
    log = readJson(rel);
  } catch (e) {
    errors.push(`${rel}: invalid JSON (${e.message})`);
    return [];
  }
  if (!Array.isArray(log) || log.length === 0) {
    errors.push(`${rel}: must be a non-empty array`);
    return [];
  }
  log.forEach((entry, i) => {
    const where = `${rel}[${i}]`;
    if (!SEMVER_RE.test(entry?.version ?? "")) errors.push(`${where}: bad version`);
    if (!DATE_RE.test(entry?.date ?? "")) errors.push(`${where}: date must be YYYY-MM-DD`);
    if (!Array.isArray(entry?.changes) || entry.changes.length === 0 || entry.changes.some((c) => typeof c !== "string" || !c.trim()))
      errors.push(`${where}: changes must be a non-empty string array`);
    const next = log[i + 1];
    if (next && SEMVER_RE.test(entry.version) && SEMVER_RE.test(next.version) && compareSemver(entry.version, next.version) <= 0)
      errors.push(`${where}: versions must be strictly descending (newest first)`);
  });
  if (log[0]?.version !== item.version) errors.push(`${rel}: newest entry ${log[0]?.version} != registry version ${item.version}`);
  return log;
}

/** Validate an item's payload shape for its kind. */
function checkPayload(item, files, taskLabels, errors) {
  const at = (f) => join(ROOT, item.path, f);
  if (files.length === 0) errors.push(`${item.path}: no payload files`);
  if (item.kind === "skill") {
    if (!files.includes("SKILL.md")) errors.push(`${item.path}: missing SKILL.md`);
    else if (frontmatterName(readFileSync(at("SKILL.md"), "utf8")) !== item.slug)
      errors.push(`${item.path}/SKILL.md: frontmatter name must be "${item.slug}"`);
  }
  if (item.kind === "subagent") {
    if (!files.includes("agent.md")) errors.push(`${item.path}: missing agent.md`);
    else if (frontmatterName(readFileSync(at("agent.md"), "utf8")) !== item.slug)
      errors.push(`${item.path}/agent.md: frontmatter name must be "${item.slug}"`);
    const extra = files.filter((f) => !["agent.md", "agent.codex.toml", "short-memory.md", "long-memory.md"].includes(f));
    if (extra.length) errors.push(`${item.path}: unexpected subagent files ${extra.join(", ")}`);
    const hasToml = files.includes("agent.codex.toml");
    if ((item.providers ?? []).includes("codex") && !hasToml) errors.push(`${item.path}: provider codex needs agent.codex.toml`);
    if (hasToml) {
      const toml = readFileSync(at("agent.codex.toml"), "utf8");
      if (!new RegExp(`^name\\s*=\\s*"${item.slug}"\\s*$`, "m").test(toml)) errors.push(`${item.path}/agent.codex.toml: name must be "${item.slug}"`);
      if (!/^description\s*=/m.test(toml)) errors.push(`${item.path}/agent.codex.toml: missing description`);
      if (!/^developer_instructions\s*=/m.test(toml)) errors.push(`${item.path}/agent.codex.toml: missing developer_instructions`);
    }
  }
  if (item.kind === "command") {
    if (files.length !== 1 || files[0] !== "command.md") errors.push(`${item.path}: a command holds exactly one command.md`);
  }
  if (item.kind === "guide") {
    if (files.length !== 1 || files[0] !== "GUIDE.md") errors.push(`${item.path}: a guide holds exactly one GUIDE.md`);
  }
  if (item.kind === "hook") {
    if (!files.includes("hook.json")) errors.push(`${item.path}: missing hook.json`);
    else {
      let doc;
      try {
        doc = JSON.parse(readFileSync(at("hook.json"), "utf8"));
      } catch (e) {
        errors.push(`${item.path}/hook.json: invalid JSON (${e.message})`);
      }
      const hooks = doc?.hooks;
      if (doc && (typeof hooks !== "object" || hooks === null || Array.isArray(hooks) || Object.keys(hooks).length === 0)) {
        errors.push(`${item.path}/hook.json: needs a non-empty "hooks" object`);
      }
      for (const [event, groups] of Object.entries(hooks ?? {})) {
        if (!EVENT_RE.test(event)) errors.push(`${item.path}/hook.json: bad event ${event}`);
        if (!Array.isArray(groups) || groups.length === 0) errors.push(`${item.path}/hook.json: ${event} needs groups`);
        for (const g of Array.isArray(groups) ? groups : []) {
          if (!Array.isArray(g?.hooks) || g.hooks.length === 0 || g.hooks.some((h) => h?.type !== "command" || typeof h.command !== "string" || !h.command.trim())) {
            errors.push(`${item.path}/hook.json: every ${event} hook must be {"type":"command","command":"…"}`);
          }
        }
      }
    }
  }
  if (item.kind === "bundle") {
    if (files.length !== 1 || files[0] !== "bundle.json") errors.push(`${item.path}: a bundle folder holds exactly bundle.json`);
  }
  if (item.kind === "vscode-task") {
    if (files.length !== 1 || files[0] !== "tasks.json") {
      errors.push(`${item.path}: a vscode-task item holds exactly one tasks.json`);
      return;
    }
    let doc;
    try {
      doc = JSON.parse(readFileSync(at("tasks.json"), "utf8"));
    } catch (e) {
      errors.push(`${item.path}/tasks.json: invalid JSON (${e.message})`);
      return;
    }
    if (!Array.isArray(doc?.tasks) || doc.tasks.length === 0) errors.push(`${item.path}/tasks.json: needs a non-empty "tasks" array`);
    if (Object.keys(doc ?? {}).some((k) => k !== "tasks")) errors.push(`${item.path}/tasks.json: only "tasks" is merged — remove other keys`);
    for (const t of doc?.tasks ?? []) {
      if (typeof t?.label !== "string" || !t.label.trim()) errors.push(`${item.path}/tasks.json: every task needs a label`);
      else if (taskLabels.has(t.label)) errors.push(`${item.path}/tasks.json: label "${t.label}" already used by ${taskLabels.get(t.label)}`);
      else taskLabels.set(t.label, item.path);
      if (t?.runOptions?.runOn === "folderOpen") errors.push(`${item.path}/tasks.json: "${t.label}" must not run on folderOpen`);
    }
  }
}

/** A bundle's member keys from its `bundle.json` (`{ "members": ["<kind>:<slug>", …] }`), or an error. */
export function bundleMembers(item) {
  let doc;
  try {
    doc = JSON.parse(readFileSync(join(ROOT, item.path, "bundle.json"), "utf8"));
  } catch (e) {
    return `invalid JSON (${e.message})`;
  }
  if (!Array.isArray(doc?.members) || doc.members.some((m) => typeof m !== "string")) return '"members" must be a string array';
  if (new Set(doc.members).size !== doc.members.length) return "duplicate members";
  return doc.members;
}

/** Detect a cycle in the requires graph; returns the cycle path or null. */
function findCycle(items) {
  const byKey = new Map(items.map((i) => [`${i.kind}:${i.slug}`, i]));
  const state = new Map();
  const visit = (key, trail) => {
    if (state.get(key) === "done") return null;
    if (state.get(key) === "active") return [...trail, key];
    state.set(key, "active");
    for (const dep of byKey.get(key)?.requires ?? []) {
      const cycle = visit(dep, [...trail, key]);
      if (cycle) return cycle;
    }
    state.set(key, "done");
    return null;
  };
  for (const key of byKey.keys()) {
    const cycle = visit(key, []);
    if (cycle) return cycle;
  }
  return null;
}

/**
 * Load registry.json and validate everything. Returns `{ items, changelogs, errors }`;
 * `changelogs` maps `kind:slug` to the parsed changelog.
 */
export function loadAndValidate() {
  const errors = [];
  let registry;
  try {
    registry = readJson("registry.json");
  } catch (e) {
    return { items: [], changelogs: new Map(), errors: [`registry.json: ${e.message}`] };
  }
  if (registry?.schema !== 1) errors.push("registry.json: schema must be 1");
  const items = Array.isArray(registry?.items) ? registry.items : [];
  if (!Array.isArray(registry?.items)) errors.push("registry.json: items must be an array");

  const keys = new Set();
  const changelogs = new Map();
  const taskLabels = new Map();
  for (const [i, item] of items.entries()) {
    const where = `registry.json items[${i}] (${item?.kind}:${item?.slug})`;
    if (!KIND_DIRS[item?.kind]) {
      errors.push(`${where}: unknown kind`);
      continue;
    }
    if (!SLUG_RE.test(item.slug ?? "") || item.slug.includes("..")) errors.push(`${where}: bad slug`);
    const key = `${item.kind}:${item.slug}`;
    if (keys.has(key)) errors.push(`${where}: duplicate ${key}`);
    keys.add(key);
    if (item.path !== `${KIND_DIRS[item.kind]}/${item.slug}`) errors.push(`${where}: path must be ${KIND_DIRS[item.kind]}/${item.slug}`);
    if (!item.name?.trim()) errors.push(`${where}: missing name`);
    if (!item.description?.trim()) errors.push(`${where}: missing description`);
    if (!SEMVER_RE.test(item.version ?? "")) errors.push(`${where}: bad version`);
    if (!CATEGORIES.includes(item.category)) errors.push(`${where}: category must be one of ${CATEGORIES.join(", ")}`);
    if (item.tags !== undefined && (!Array.isArray(item.tags) || item.tags.some((t) => typeof t !== "string")))
      errors.push(`${where}: tags must be a string array`);
    if (item.providers !== undefined) {
      if (!PROVIDER_KINDS.includes(item.kind)) errors.push(`${where}: providers only apply to ${PROVIDER_KINDS.join("/")}`);
      else if (!Array.isArray(item.providers) || item.providers.length === 0 || item.providers.some((p) => !PROVIDERS.includes(p)))
        errors.push(`${where}: providers must be a non-empty subset of ${PROVIDERS.join(", ")}`);
    }
    if (!existsSync(join(ROOT, item.path)) || !statSync(join(ROOT, item.path)).isDirectory()) {
      errors.push(`${where}: folder ${item.path} not found`);
      continue;
    }
    changelogs.set(key, checkChangelog(item, errors));
    checkPayload(item, payloadFiles(item.path), taskLabels, errors);
  }

  for (const item of items) {
    for (const dep of item.requires ?? []) {
      if (!keys.has(dep)) errors.push(`${item.kind}:${item.slug}: requires unknown ${dep}`);
      if (dep === `${item.kind}:${item.slug}`) errors.push(`${item.kind}:${item.slug}: requires itself`);
    }
  }
  for (const item of items.filter((i) => i.kind === "bundle")) {
    const members = bundleMembers(item);
    if (typeof members === "string") {
      errors.push(`${item.path}/bundle.json: ${members}`);
      continue;
    }
    if (members.length < 2) errors.push(`${item.path}/bundle.json: a bundle needs at least two members`);
    for (const m of members) {
      if (!keys.has(m)) errors.push(`${item.path}/bundle.json: unknown member ${m}`);
      else if (!BUNDLE_MEMBER_KINDS.includes(m.split(":")[0])) errors.push(`${item.path}/bundle.json: ${m} cannot be in a bundle`);
    }
  }
  const cycle = findCycle(items);
  if (cycle) errors.push(`requires cycle: ${cycle.join(" -> ")}`);

  // Every item folder on disk must be registered.
  for (const [kind, dir] of Object.entries(KIND_DIRS)) {
    if (!existsSync(join(ROOT, dir))) continue;
    for (const e of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
      if (e.isDirectory() && !keys.has(`${kind}:${e.name}`)) errors.push(`${dir}/${e.name}: folder not in registry.json`);
    }
  }
  return { items, changelogs, errors };
}

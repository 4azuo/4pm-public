#!/usr/bin/env node
/**
 * Pack every registry item into a marketplace zip (`4pm-package.json` manifest + payload — ADR-0185)
 * and write the release index `dist/registry.json` (ADR-0459) that the market-server seed reads.
 * Zips are deterministic (sorted entries, fixed timestamps) so the same source gives the same sha256.
 * A bundle (ADR-0461) is composed from its member items' folders under `items/<kind>/<slug>/`.
 *
 * Usage: node tools/pack.mjs [--ref v2026.10.11] [--out dist]
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { crc32, deflateRawSync } from "node:zlib";
import { ROOT, bundleMembers, loadAndValidate, payloadFiles } from "./lib.mjs";

/** Read a `--name value` CLI argument. */
function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

/** DOS time/date for 1980-01-01 00:00 — a fixed stamp keeps zips reproducible. */
const DOS_TIME = 0;
const DOS_DATE = (0 << 9) | (1 << 5) | 1;

/** Build a zip archive (deflate) from `[path, Buffer]` entries. */
function buildZip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [path, data] of entries) {
    const name = Buffer.from(path, "utf8");
    const compressed = deflateRawSync(data, { level: 9 });
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, name, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);
    offset += local.length + name.length + compressed.length;
  }
  const centralSize = centrals.reduce((n, b) => n + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...centrals, end]);
}

const { items, changelogs, errors } = loadAndValidate();
if (errors.length) {
  for (const e of errors) console.error(`✗ ${e}`);
  console.error("\nFix the errors above (node tools/validate.mjs) before packing.");
  process.exit(1);
}

const outDir = join(ROOT, arg("out", "dist"));
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const index = [];
const byKey = new Map(items.map((i) => [`${i.kind}:${i.slug}`, i]));

/** The payload entries of an item: its own files, or (bundle) every member's files under items/<kind>/<slug>/. */
function payloadEntries(item) {
  if (item.kind !== "bundle") return payloadFiles(item.path).map((f) => [f, readFileSync(join(ROOT, item.path, f))]);
  const entries = [];
  for (const key of bundleMembers(item)) {
    const m = byKey.get(key);
    for (const f of payloadFiles(m.path)) entries.push([`items/${m.kind}/${m.slug}/${f}`, readFileSync(join(ROOT, m.path, f))]);
  }
  return entries;
}

/** Bundle members for the manifest (`{kind, slug, providers?}`). */
function manifestMembers(item) {
  return bundleMembers(item).map((key) => {
    const m = byKey.get(key);
    return { kind: m.kind, slug: m.slug, ...(m.providers ? { providers: m.providers } : {}) };
  });
}

for (const item of items) {
  const latest = changelogs.get(`${item.kind}:${item.slug}`)[0];
  const manifest = {
    schema: 1,
    kind: item.kind,
    slug: item.slug,
    name: item.name,
    version: item.version,
    description: item.description,
    author: "4PM",
    changelog: latest.changes.join("\n"),
    ...(item.providers ? { providers: item.providers } : {}),
    ...(item.requires ? { requires: item.requires } : {}),
    ...(item.kind === "bundle" ? { members: manifestMembers(item) } : {}),
  };
  const entries = [["4pm-package.json", Buffer.from(JSON.stringify(manifest, null, 2) + "\n")], ...payloadEntries(item)];

  const zip = buildZip(entries);
  const asset = `${item.kind}--${item.slug}--${item.version}.zip`;
  writeFileSync(join(outDir, asset), zip);
  const sha256 = createHash("sha256").update(zip).digest("hex");
  const { path: _path, ...meta } = item;
  index.push({ ...meta, changelog: latest, asset, sha256, sizeBytes: zip.length });
  console.log(`packed ${asset} (${zip.length} bytes)`);
}

writeFileSync(
  join(outDir, "registry.json"),
  JSON.stringify({ schema: 1, ref: arg("ref", null), generatedAt: new Date().toISOString(), items: index }, null, 2) + "\n",
);
console.log(`\n✓ ${index.length} package(s) + registry.json in ${outDir}`);

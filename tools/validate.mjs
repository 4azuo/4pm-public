#!/usr/bin/env node
/**
 * Validate registry.json, every item's changelog.json and payload shape. Exit 1 on any error.
 * Usage: node tools/validate.mjs
 */
import { loadAndValidate } from "./lib.mjs";

const { items, errors } = loadAndValidate();
if (errors.length) {
  for (const e of errors) console.error(`✗ ${e}`);
  console.error(`\n${errors.length} error(s).`);
  process.exit(1);
}
console.log(`✓ ${items.length} item(s) valid.`);

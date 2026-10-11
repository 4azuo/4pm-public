#!/usr/bin/env node
/**
 * bash-guard — a PreToolUse hook for the Bash/shell tool. Reads the hook payload (JSON on stdin),
 * and blocks a small set of destructive or exfiltration-prone commands. Everything else passes.
 *
 * Blocking: prints a reason to stderr and exits 2 (Claude Code), and also prints
 * {"decision":"block","reason":…} on stdout (Codex). Allowing: exit 0 with no output.
 * Dependency-free; never reads or prints secrets.
 */
import { readFileSync } from "node:fs";

/** [pattern, reason] — matched against the whole command string. */
const RULES = [
  [/\brm\s+(-[a-zA-Z]*r[a-zA-Z]*f|-[a-zA-Z]*f[a-zA-Z]*r)\s+(\/|~|\$HOME|\*)(\s|$)/, "recursive delete of /, ~ or *"],
  [/\bgit\s+push\b[^\n]*\s(--force|-f)(\s|$)(?![^\n]*--force-with-lease)/, "force push (use --force-with-lease on your own branch)"],
  [/\bgit\s+push\b[^\n]*\s(origin\s+)?(main|master)(\s|$)/, "direct push to main/master — open a pull request"],
  [/\bgit\s+reset\s+--hard\s+(origin\/)?(main|master)\b/, "hard reset onto main/master"],
  [/\b(curl|wget)\b[^|\n]*\|\s*(sudo\s+)?(ba|z)?sh\b/, "piping a download straight into a shell"],
  [/\bchmod\s+-R\s+777\b/, "chmod -R 777"],
  [/\bmkfs(\.\w+)?\b|\bdd\s+[^\n]*of=\/dev\//, "writing to a raw device"],
  [/(^|[\s;&|])(cat|less|more|head|tail)\s+[^\n]*(\.env(\.\w+)?|project\.secrets\.json|id_rsa|\.credentials\.json)(\s|$)/, "printing a secrets file"],
];

/** Parse the hook payload; an unreadable payload is allowed (fail-open keeps the agent usable). */
function readCommand() {
  try {
    const payload = JSON.parse(readFileSync(0, "utf8") || "{}");
    const input = payload.tool_input ?? payload.input ?? {};
    return typeof input.command === "string" ? input.command : "";
  } catch {
    return "";
  }
}

const command = readCommand();
const hit = RULES.find(([re]) => re.test(command));
if (hit) {
  const reason = `bash-guard blocked this command: ${hit[1]}. Ask the user if it is really intended.`;
  process.stdout.write(JSON.stringify({ decision: "block", reason }) + "\n");
  process.stderr.write(reason + "\n");
  process.exit(2);
}
process.exit(0);

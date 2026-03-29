#!/usr/bin/env node

/**
 * Teamflow dashboard launcher shim.
 *
 * Uses tsx to run the TypeScript server entry point directly (critic issue C4:
 * use tsx directly, don't compile to build/).
 */

import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverPath = join(__dirname, "..", "src", "server.ts");
const tsxPath = join(__dirname, "..", "node_modules", ".bin", "tsx");

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  console.log("Usage: teamflow [options]");
  console.log("");
  console.log("Options:");
  console.log("  --help, -h     Show this help message");
  console.log("");
  console.log("Environment variables:");
  console.log("  TEAMFLOW_PORT        Port to bind to (default: 7425)");
  console.log("  TEAMFLOW_NO_OPEN     Set to 1 to suppress browser auto-open");
  console.log("  CLAUDE_PROJECT_DIR   Project root directory (default: cwd)");
  process.exit(0);
}

const child = spawn(tsxPath, [serverPath, ...args], {
  stdio: "inherit",
  env: process.env,
});

child.on("exit", (code) => {
  process.exit(code ?? 0);
});

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Isolates review parsing from discover-topic.sh's known GNU stat defect.
export function writeFixtureStat(root: string, mode: "mtime" | "gnu-failure" = "mtime") {
  const bin = join(root, `stat-${mode}`);
  mkdirSync(bin, { recursive: true });
  writeFileSync(join(bin, "stat"), `#!/usr/bin/env node
const { statSync } = require("node:fs");
const [flag, format, file] = process.argv.slice(2);
if (process.argv.length !== 5 ||
    !((flag === "-f" && format === "%m") || (flag === "-c" && format === "%Y"))) {
  console.error("fixture stat: unsupported arguments");
  process.exit(2);
}
try {
  const seconds = Math.floor(statSync(file).mtimeMs / 1000);
  if (${JSON.stringify(mode)} === "gnu-failure" && flag === "-f") {
    process.stdout.write('  File: "' + file + '"\\n    Type: fixture-filesystem\\n');
    console.error("stat: cannot read file system information for '%m': No such file or directory");
    process.exitCode = 1;
  } else {
    console.log(seconds);
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
`, { mode: 0o755 });
  console.log(JSON.stringify({ operation: "stat control", mode, executable: join(bin, "stat"),
    mtimeSource: "actual fixture file metadata", nativeDeliveryEvidence: false }));
  return bin;
}

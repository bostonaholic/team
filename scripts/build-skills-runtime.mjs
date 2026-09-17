import { gzipSync } from "fflate";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { BOOTSTRAP, COMPRESSED_LIMIT, DECODED_LIMIT, stripBootstrap, validateEnvelope } from "./skills-runtime-resolver.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const startup = `# Packaged runtime startup

Only the invoking root session initializes a runtime. Nested calls and subagents inherit root and mode, without initialization.
Resolve <skill-dir> from the host-supplied absolute base of this loaded skill, never from the consumer checkout.
Pass that installation path without resolving its registration links.
If that base is unavailable, stop and report "missing absolute skill base".
Resolve <consumer-root> from the host's absolute consumer project root, separately from the installed skill base.
If that root is unavailable, stop and report "missing absolute consumer project root". Never infer it from the invocation subdirectory.
Run this command with each absolute path quoted as a separate argument:

\`\`\`sh
node "<skill-dir>/runtime/resolve.mjs" "<consumer-root>"
\`\`\`

If Node is missing, stop and report "missing Node runtime". On nonzero exit, report the resolver diagnostic and stop.
Parse the returned JSON mode, root, and skillPath. Preserve these values for every nested operation.
In plugin mode, continue this original procedure with the native root. Native resolution writes nothing.
In skills mode, read skillPath and apply that canonical procedure with the original arguments and explicit invocation context.
Read <root>/skills/team/references/skill-dispatch.md before nested invocation or continuation guidance.

Packaged initialization permits only this root session's fresh private temporary writes and failed-initialization cleanup.
Read-only commands permit this exception before workflow work. Subagents never receive it.
It permits no project, installation, configuration, workflow, or external-service writes.
Keep project paths, artifacts, Git operations, and configuration relative to the consumer project.
Successful private directories remain readable for active agents until operating-system temporary cleanup. Do not retry or delete another invocation's directory.
`;

function files(directory, prefix = "") {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (/^skills\/[^/]+\/runtime(?:\/|$)/.test(path)) return [];
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) return files(absolute, path);
    if (!entry.isFile()) throw new Error(`unsupported source file type or link: ${absolute}`);
    return [path];
  });
}

function generatedFiles(directory, prefix = "") {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) return generatedFiles(join(directory, entry.name), path);
    if (!entry.isFile()) throw new Error(`unsupported generated runtime file type or link: ${join(directory, entry.name)}`);
    return [path];
  });
}

function generate(check) {
  const skills = join(root, "skills");
  const names = readdirSync(skills, { withFileTypes: true }).filter((entry) => entry.isDirectory() && existsSync(join(skills, entry.name, "SKILL.md"))).map((entry) => entry.name).sort();
  if (names.length === 0) throw new Error("no source commands: skills directory is empty");
  const paths = [...files(skills, "skills"), ...files(join(root, "agents"), "agents"), "docs/versioning.md"].sort();
  const records = paths.map((path) => ({
    path,
    text: stripBootstrap(new TextDecoder("utf-8", { fatal: true }).decode(readFileSync(join(root, path)))),
    executable: Boolean(lstatSync(join(root, path)).mode & 0o111),
  }));
  const decoded = Buffer.from(JSON.stringify(records));
  if (decoded.length > DECODED_LIMIT) throw new Error("decoded runtime exceeds 8 MiB limit");
  const compressed = Buffer.from(gzipSync(decoded, { level: 9, mtime: 0 }));
  if (compressed.length > COMPRESSED_LIMIT) throw new Error("compressed runtime exceeds 2 MiB limit");
  const envelope = { schema: 1, encoding: "gzip+base64", digest: createHash("sha256").update(compressed).digest("hex"), data: compressed.toString("base64") };
  if (JSON.stringify(validateEnvelope(envelope)) !== JSON.stringify(records)) throw new Error("decoded runtime differs from canonical sources");
  const bundle = JSON.stringify(envelope) + "\n";
  const resolver = readFileSync(join(root, "scripts/skills-runtime-resolver.mjs"), "utf8");
  const expected = new Map();
  const dependent = names.filter((name) => name !== "principle-fix-root-causes");
  for (const name of dependent) {
    const entryPath = `skills/${name}/SKILL.md`;
    const canonical = records.find((record) => record.path === entryPath).text;
    if (!/^---\n[\s\S]*?\n---\n/.test(canonical)) throw new Error(`missing frontmatter: ${entryPath}`);
    expected.set(entryPath, canonical.replace(/^(---\n[\s\S]*?\n---\n)/, `$1${BOOTSTRAP}`));
    for (const [file, text] of [["resolve.mjs", resolver], ["start.md", startup], ["bundle.json", bundle]]) expected.set(`skills/${name}/runtime/${file}`, text);
  }
  const actualGenerated = generatedFiles(skills).filter((path) => /^[^/]+\/runtime\//.test(path)).map((path) => `skills/${path}`);
  const stale = actualGenerated.filter((path) => !expected.has(path));
  for (const [path, text] of expected) {
    if (!existsSync(join(root, path)) || !lstatSync(join(root, path)).isFile() || readFileSync(join(root, path), "utf8") !== text) stale.push(path);
  }
  if (check) {
    if (stale.length) throw new Error(`stale generated runtime or bootstrap:\n${stale.join("\n")}`);
  } else {
    for (const path of actualGenerated) if (!expected.has(path)) rmSync(join(root, path));
    for (const [path, text] of expected) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), text);
    }
  }
  process.stdout.write(`${dependent.length} runtime bundles; ${Buffer.byteLength(bundle)} bytes per command; ${Buffer.byteLength(bundle) * dependent.length} aggregate archive bytes; ${decoded.length} decoded bytes\n`);
}

try {
  if (process.argv.slice(2).some((arg) => arg !== "--check")) throw new Error("usage: build-skills-runtime.mjs [--check]");
  generate(process.argv.includes("--check"));
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}

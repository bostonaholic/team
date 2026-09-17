import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { gunzipSync } from "node:zlib";

export const COMPRESSED_LIMIT = 2 * 1024 * 1024;
export const DECODED_LIMIT = 8 * 1024 * 1024;
export const BOOTSTRAP = "<!-- team-runtime:start -->\nBefore workflow work, read [runtime startup](runtime/start.md).\n<!-- team-runtime:end -->\n";

export function stripBootstrap(text) {
  return text.replace(/^<!-- team-runtime:start -->\n[^\n]*\n<!-- team-runtime:end -->\n/gm, "");
}

export function validateEnvelope(value) {
  if (!value || value.schema !== 1) throw new Error("unsupported runtime schema");
  if (value.encoding !== "gzip+base64") throw new Error("unsupported runtime encoding");
  if (typeof value.data !== "string" || value.data.length > Math.ceil(COMPRESSED_LIMIT / 3) * 4) {
    throw new Error("compressed runtime exceeds 2 MiB limit");
  }
  if (value.data.length % 4 !== 0 || /[^A-Za-z0-9+/=]/.test(value.data) || Buffer.from(value.data, "base64").toString("base64") !== value.data) {
    throw new Error("invalid base64 encoding");
  }
  const compressed = Buffer.from(value.data, "base64");
  if (compressed.length > COMPRESSED_LIMIT) throw new Error("compressed runtime exceeds 2 MiB limit");
  if (createHash("sha256").update(compressed).digest("hex") !== value.digest) throw new Error("runtime digest mismatch");
  const decoded = gunzipSync(compressed, { maxOutputLength: DECODED_LIMIT });
  const text = new TextDecoder("utf-8", { fatal: true }).decode(decoded);
  const records = JSON.parse(text);
  if (!Array.isArray(records) || records.length === 0) throw new Error("runtime records must be a nonempty array");
  const paths = new Set();
  for (const record of records) {
    if (!record || Object.keys(record).sort().join(",") !== "executable,path,text" || typeof record.text !== "string" || typeof record.executable !== "boolean") {
      throw new Error("unsupported runtime record fields or file type");
    }
    const path = record.path;
    if (typeof path !== "string" || isAbsolute(path) || path.includes("\\") || path.includes("\0") || path.split("/").some((part) => part === "" || part === "." || part === "..") || /^[A-Za-z]:/.test(path)) {
      throw new Error(`invalid runtime path: ${path}`);
    }
    if (paths.has(path)) throw new Error(`duplicate runtime path: ${path}`);
    paths.add(path);
  }
  for (const path of paths) {
    const components = path.split("/");
    while (components.length > 1) {
      components.pop();
      if (paths.has(components.join("/"))) throw new Error(`runtime path conflicts with a file: ${path}`);
    }
  }
  return records;
}

function contains(root, path) {
  const child = relative(root, path);
  return child === "" || (!child.startsWith(`..${sep}`) && child !== ".." && !isAbsolute(child));
}

function nativeRoot(skillDirectory) {
  const skills = dirname(skillDirectory);
  if (basename(skills) !== "skills") return null;
  const root = dirname(skills);
  const markers = [".claude-plugin/plugin.json", ".codex-plugin/plugin.json", "plugin.json"];
  const manifests = markers.filter((path) => existsSync(join(root, path)));
  if (manifests.length === 0) return null;
  const team = manifests.some((path) => JSON.parse(readFileSync(join(root, path), "utf8")).name === "team");
  if (!team) return null;
  const registryPath = join(root, "skills/team/registry.json");
  const registry = JSON.parse(readFileSync(registryPath, "utf8"));
  if (!Array.isArray(registry.agents) || registry.agents.length === 0) throw new Error(`incomplete native plugin registry: ${registryPath}`);
  for (const agent of registry.agents) {
    if (!/^[a-z][a-z0-9-]*$/.test(agent.name)) throw new Error(`invalid native agent in ${registryPath}`);
    const definition = join(root, "agents", `${agent.name}.md`);
    if (!statSync(definition).isFile()) throw new Error(`incomplete native plugin: ${definition}`);
  }
  return root;
}

export function resolveRuntime(resolverPath, consumerRoot) {
  const invokedInstallation = realpathSync(dirname(dirname(dirname(resolverPath))));
  const skillDirectory = dirname(dirname(realpathSync(resolverPath)));
  const command = basename(skillDirectory);
  const native = nativeRoot(skillDirectory);
  if (native) return { mode: "plugin", root: native, skillPath: join(skillDirectory, "SKILL.md") };
  if (typeof consumerRoot !== "string" || !isAbsolute(consumerRoot)) {
    throw new Error("missing or invalid absolute consumer project root");
  }
  if (!existsSync(consumerRoot) || !statSync(consumerRoot).isDirectory()) {
    throw new Error(`consumer project root must be an existing directory: ${consumerRoot}`);
  }
  const project = realpathSync(consumerRoot);
  const payload = join(skillDirectory, "runtime/bundle.json");
  let records;
  try {
    if (statSync(payload).size > 4 * 1024 * 1024) throw new Error("compressed runtime envelope size limit exceeded");
    records = validateEnvelope(JSON.parse(readFileSync(payload, "utf8")));
  } catch (error) {
    throw new Error(`${payload}: ${error.message}`, { cause: error });
  }
  const entrypoint = join(skillDirectory, "SKILL.md");
  const canonical = records.find((record) => record.path === `skills/${command}/SKILL.md`);
  const installed = stripBootstrap(readFileSync(entrypoint, "utf8").replace(/\r\n/g, "\n"));
  if (!canonical || installed !== canonical.text.replace(/\r\n/g, "\n")) {
    throw new Error(`${entrypoint}: packaged entrypoint differs from bundle; regenerate canonical source and reinstall`);
  }
  const temporary = realpathSync(tmpdir());
  if (contains(project, temporary) || contains(invokedInstallation, temporary) || contains(dirname(skillDirectory), temporary)) {
    throw new Error(`temporary runtime destination is inside the project or installation: ${temporary}`);
  }
  const root = mkdtempSync(join(temporary, "team-runtime-"));
  try {
    chmodSync(root, 0o700);
    for (const record of records) {
      const destination = join(root, record.path);
      const parents = record.path.split("/").slice(0, -1);
      let directory = root;
      for (const part of parents) {
        directory = join(directory, part);
        if (!existsSync(directory)) mkdirSync(directory, { mode: 0o700 });
      }
      writeFileSync(destination, record.text, { flag: "wx", mode: record.executable ? 0o700 : 0o600 });
    }
  } catch (error) {
    rmSync(root, { recursive: true, force: true });
    throw new Error(`${root}: ${error.message}`, { cause: error });
  }
  return { mode: "skills", root, skillPath: join(root, "skills", command, "SKILL.md") };
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  try {
    process.stdout.write(`${JSON.stringify(resolveRuntime(process.argv[1], process.argv[2]))}\n`);
  } catch (error) {
    process.stderr.write(`${fileURLToPath(import.meta.url)}: ${error.message}\n`);
    process.exitCode = 1;
  }
}

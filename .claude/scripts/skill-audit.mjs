#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join, posix, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const FRONTMATTER_BOUNDARY = /^---\s*$/m;
const WORD = /\S+/g;
const SKILL_PATH = /^skills\/([^/]+)\/SKILL\.md$/;
const INTERNAL_PHASES = new Set([
  "team-worktree",
  "team-question",
  "team-research",
  "team-design",
  "team-structure",
  "team-plan",
  "team-implement",
  "team-pr",
]);
const QRSPI = new Set(["team", "team-fix", ...INTERNAL_PHASES]);
const READ_ONLY_UTILITIES = new Set([
  "code-review",
  "eng-design-doc-review",
  "how",
  "why",
  "pr-verify",
]);
const MUTATING_UTILITIES = new Set([
  "groom-backlog",
  "pr-cleanup",
  "pr-open-comments",
  "pr-rebase",
  "pr-watch-as-author",
  "pr-watch-as-reviewer",
  "reflect",
  "shipit",
]);

function words(text) {
  return text.match(WORD)?.length ?? 0;
}

function scalar(value) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  return trimmed;
}

export function splitSkill(text) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  if (lines[0]?.trim() !== "---") {
    return { frontmatter: {}, body: text, rawFrontmatter: "" };
  }

  const end = lines.findIndex((line, index) => index > 0 && FRONTMATTER_BOUNDARY.test(line));
  if (end === -1) return { frontmatter: {}, body: text, rawFrontmatter: "" };

  const raw = lines.slice(1, end);
  const frontmatter = {};
  for (let index = 0; index < raw.length; index += 1) {
    const match = /^([a-zA-Z0-9_-]+):(?:\s*(.*))?$/.exec(raw[index]);
    if (!match) continue;
    const [, key, rawValue = ""] = match;
    if (rawValue === "|" || rawValue === ">") {
      const block = [];
      while (index + 1 < raw.length && /^\s+/.test(raw[index + 1])) {
        block.push(raw[index + 1].replace(/^\s{2}/, ""));
        index += 1;
      }
      frontmatter[key] = block.join(rawValue === ">" ? " " : "\n").trim();
    } else {
      frontmatter[key] = scalar(rawValue);
    }
  }

  return {
    frontmatter,
    rawFrontmatter: raw.join("\n"),
    body: lines.slice(end + 1).join("\n").replace(/^\n+/, ""),
  };
}

function regularFiles(root) {
  if (!existsSync(root)) return [];
  const output = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) output.push(...regularFiles(path));
    else if (entry.isFile()) output.push(path);
  }
  return output;
}

function currentFiles(root) {
  const skillsRoot = join(root, "skills");
  const files = new Map();
  for (const path of regularFiles(skillsRoot)) {
    files.set(relative(root, path), readFileSync(path, "utf8"));
  }
  return files;
}

function gitFiles(root, ref) {
  const names = execFileSync("git", ["ls-tree", "-r", "--name-only", ref, "--", "skills"], {
    cwd: root,
    encoding: "utf8",
  })
    .split("\n")
    .filter(Boolean);
  const files = new Map();
  const result = spawnSync("git", ["cat-file", "--batch"], {
    cwd: root,
    input: `${names.map((name) => `${ref}:${name}`).join("\n")}\n`,
    maxBuffer: 50 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(result.stderr.toString("utf8").trim() || `cannot read ${ref}`);
  }

  let offset = 0;
  for (const name of names) {
    const headerEnd = result.stdout.indexOf(10, offset);
    if (headerEnd === -1) throw new Error(`invalid git cat-file response for ${name}`);
    const header = result.stdout.subarray(offset, headerEnd).toString("utf8");
    const match = /^[0-9a-f]+ blob (\d+)$/.exec(header);
    if (!match) throw new Error(`cannot read ${ref}:${name}: ${header}`);
    const size = Number(match[1]);
    const contentStart = headerEnd + 1;
    files.set(name, result.stdout.subarray(contentStart, contentStart + size).toString("utf8"));
    offset = contentStart + size + 1;
  }
  return files;
}

const SKILL_FILE_REFERENCE =
  /(?<![A-Za-z0-9._/<>-])(?:<skill-dir>|skills|\.{1,2})(?:\/[A-Za-z0-9._-]+)+\/SKILL\.md/g;

function skillFileReferences(body, directory, files) {
  const flat = body.replace(/\s+/g, " ");
  const references = [];
  for (const match of flat.matchAll(SKILL_FILE_REFERENCE)) {
    const raw = match[0];
    const path = raw.startsWith("<skill-dir>/")
      ? posix.normalize(posix.join(directory, raw.slice("<skill-dir>/".length)))
      : raw.startsWith("skills/")
        ? posix.normalize(raw)
        : posix.normalize(posix.join(directory, raw));
    const parsed = SKILL_PATH.exec(path);
    if (!parsed || !files.has(path) || path === `${directory}/SKILL.md`) continue;
    references.push({ index: match.index ?? 0, name: parsed[1], path });
  }
  return references;
}

function referencedSkills(body, directory, files) {
  return [...new Set(skillFileReferences(body, directory, files).map(({ name }) => name))].sort();
}

function readSkills(body, directory, files) {
  const flat = body.replace(/\s+/g, " ");
  const names = new Set();
  for (const reference of skillFileReferences(body, directory, files)) {
    const prefix = flat.slice(Math.max(0, reference.index - 180), reference.index);
    const boundary = Math.max(
      prefix.lastIndexOf("."),
      prefix.lastIndexOf("!"),
      prefix.lastIndexOf("?"),
      prefix.lastIndexOf(";"),
      prefix.lastIndexOf(":"),
    );
    if (!/\b(?:read|load|follow)\b/i.test(prefix.slice(boundary + 1))) continue;
    if (!isNegatedMatch(flat, reference.index)) names.add(reference.name);
  }
  return [...names].sort();
}

const NEGATION = /\b(?:no|never|without|cannot|can't|won't|don't|doesn't|mustn't)\b|\bnot\b(?!\s+only\b)/i;
const NEGATION_RESET = /\b(?:but|however|instead|then)\b/gi;

function isNegatedMatch(text, index) {
  const prefix = text.slice(Math.max(0, index - 180), index);
  const boundary = Math.max(
    prefix.lastIndexOf("."),
    prefix.lastIndexOf("!"),
    prefix.lastIndexOf("?"),
    prefix.lastIndexOf(";"),
    prefix.lastIndexOf(":"),
  );
  const clause = prefix.slice(boundary + 1);
  const comma = clause.lastIndexOf(",");
  const local = clause.slice(comma + 1);
  if (/\b(?:ask|tell|instruct) (?:the )?user to\s*$/i.test(local)) return true;
  const negations = [...local.matchAll(new RegExp(NEGATION.source, "gi"))];
  const resets = [...local.matchAll(NEGATION_RESET)];
  if ((negations.at(-1)?.index ?? -1) > (resets.at(-1)?.index ?? -1)) return true;
  if (comma === -1 || /\b(?:but|however|instead|then)\b/i.test(local)) return false;
  const prior = clause.slice(0, comma);
  if (/^\s*(?:if|when|unless|after|before|once|while|without)\b/i.test(prior)) return false;
  return /^\s*(?:(?:and|or)\s+)?$/i.test(local) && NEGATION.test(prior);
}

function hasPositiveMatch(text, pattern) {
  const flat = text.replace(/\s+/g, " ");
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  for (const match of flat.matchAll(new RegExp(pattern.source, flags))) {
    if (!isNegatedMatch(flat, match.index ?? 0)) return true;
  }
  return false;
}

function loadedSkills(body) {
  const flat = body.replace(/\s+/g, " ").trim();
  const names = new Set();
  for (const match of flat.matchAll(/(?:call|invoke) the Skill tool (?:with|for)\b/gi)) {
    if (isNegatedMatch(flat, match.index ?? 0)) continue;
    const tail = flat.slice((match.index ?? 0) + match[0].length);
    const clause = tail.split(/(?<=[.:;!?])\s/)[0] ?? tail;
    const clauseStart = (match.index ?? 0) + match[0].length;
    for (const name of clause.matchAll(/`([a-z0-9][a-z0-9-]*)`/g)) {
      if (!isNegatedMatch(flat, clauseStart + (name.index ?? 0))) names.add(name[1]);
    }
  }
  for (const match of flat.matchAll(/Full methodology:\s*`([a-z0-9-]+)`/gi)) names.add(match[1]);
  for (const name of composedSkills(body)) names.add(name);
  return [...names].sort();
}

function composedSkills(body) {
  const names = new Set();
  const lines = body.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    if (!/^\s*\|/.test(lines[index])) continue;
    const headings = lines[index]
      .trim()
      .replace(/^\||\|$/g, "")
      .split("|")
      .map((cell) => cell.trim());
    const skillColumn = headings.findIndex((heading) => /^(?:internal\s+)?skill$/i.test(heading));
    if (skillColumn === -1 || !/^\s*\|(?:\s*:?-{3,}:?\s*\|)+\s*$/.test(lines[index + 1] ?? "")) {
      continue;
    }
    for (index += 2; index < lines.length && /^\s*\|/.test(lines[index]); index += 1) {
      const cells = lines[index]
        .trim()
        .replace(/^\||\|$/g, "")
        .split("|")
        .map((cell) => cell.trim());
      for (const match of (cells[skillColumn] ?? "").matchAll(/`([a-z0-9][a-z0-9-]*)`/g)) {
        names.add(match[1]);
      }
    }
  }
  return [...names].sort();
}

function cohort(name) {
  if (name.startsWith("principle-")) return "principle";
  if (QRSPI.has(name)) return "qrspi";
  if (READ_ONLY_UTILITIES.has(name)) return "read-only-utility";
  if (MUTATING_UTILITIES.has(name)) return "mutating-utility";
  return "methodology";
}

function openaiInterface(files, directory) {
  const text = files.get(`${directory}/agents/openai.yaml`);
  if (!text) return null;
  const value = (key) => {
    const match = new RegExp(`^\\s+${key}:\\s*(.+)$`, "m").exec(text);
    return match ? scalar(match[1]) : null;
  };
  return {
    displayName: value("display_name"),
    shortDescription: value("short_description"),
    defaultPrompt: value("default_prompt"),
    allowImplicitInvocation: value("allow_implicit_invocation"),
  };
}

const ARTIFACT = /(?<![A-Za-z0-9_-])(?:docs\/plans\/(?:<[^>]+>|[A-Za-z0-9_${}.-]+)\/)?(?:1-task|2-questions|3-prd|4-repos|5-research|6-design|7-structure|8-plan|brief|design-review-<n>|cross-model-notes|cross-model-raw|plan|9-implementation|implementation-log|verification|ux-capture-manifest|rebase-<n>|10-pr)\.md/g;
const ARTIFACT_INPUT = /\b(?:read(?:s|ing)?|consum(?:e|es|ed|ing)|requir(?:e|es|ed|ing)|load(?:s|ed|ing)?|inspect(?:s|ed|ing)?|match(?:es|ed|ing)?|use(?:s|d|ing)?|contain(?:s|ed|ing)?|reference(?:s|d|ing)?)\b|\b(?:from|given|beside|alongside)\b|\b(?:dispatch|call|invoke)(?:s|ed|ing)?\b[^.!?;:]{0,100}\bwith\b|\bbefore\b[^.!?;:]{0,100}\bverif(?:y|ies|ied|ying)\b/gi;
const ARTIFACT_OUTPUT = /\b(?:write|create|update|append|produce|emit|persist|record|draft|replace|modify|overwrite|revise)(?:s|d|ing)?\b|\bverif(?:y|ies|ied|ying)\b|\bcombin(?:e|es|ed|ing)\b(?=[^.!?;:]{0,120}\binto\b)/gi;

function directionLabel(text) {
  const label = text
    .replace(/^#{1,6}\s+/, "")
    .replace(/[*_`]/g, "")
    .replace(/:\s*$/, "")
    .trim();
  const input = /^(?:required\s+)?(?:input|inputs|reads?|consumes?|requires?|loads?|inspects?)$/i.test(label) ||
    /^resolve\s+input$/i.test(label);
  const output = /^(?:required\s+)?(?:output|outputs|writes?|creates?|updates?|produces?)$/i.test(label);
  return input === output ? null : input ? "input" : "output";
}

function declaredListDirection(text) {
  const exact = directionLabel(text);
  if (exact) return exact;
  const match = /\b(read|consume|require|load|inspect|write|create|update|append|produce|emit|persist|record)s?\s*:\s*$/i.exec(text);
  if (!match || isNegatedMatch(text, match.index)) return null;
  return /^(?:read|consume|require|load|inspect)/i.test(match[1]) ? "input" : "output";
}

function sentenceUnits(text, fallbackDirection) {
  return text
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?;])\s+/)
    .filter(Boolean)
    .map((unit) => ({ text: unit, fallbackDirection }));
}

function artifactUnits(description, body) {
  const units = sentenceUnits(description, null);
  const lines = body.split("\n");
  let sectionDirection = null;
  let listDirection = null;
  let current = null;
  let inFence = false;

  const flush = () => {
    if (!current) return;
    units.push(...sentenceUnits(current.text, current.fallbackDirection));
    current = null;
  };

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (/^```/.test(trimmed)) {
      flush();
      inFence = !inFence;
      continue;
    }
    if (inFence) {
      if (trimmed) units.push({ text: trimmed, fallbackDirection: sectionDirection });
      continue;
    }
    if (/^#{1,6}\s+/.test(trimmed)) {
      flush();
      sectionDirection = directionLabel(trimmed);
      listDirection = null;
      continue;
    }
    if (/^\|/.test(trimmed)) {
      flush();
      listDirection = null;
      if (!/^\|(?:\s*:?-{3,}:?\s*\|)+\s*$/.test(trimmed)) {
        for (const cell of trimmed.replace(/^\||\|$/g, "").split("|")) {
          units.push(...sentenceUnits(cell, sectionDirection));
        }
      }
      continue;
    }
    const declaredDirection = declaredListDirection(trimmed);
    if (declaredDirection && !/^[-*+]\s+/.test(trimmed)) {
      flush();
      if (!directionLabel(trimmed)) {
        units.push(...sentenceUnits(trimmed, sectionDirection));
      }
      listDirection = declaredDirection;
      continue;
    }
    const item = /^\s*[-*+]\s+(.*)$/.exec(rawLine);
    if (item) {
      flush();
      current = {
        text: item[1],
        fallbackDirection: listDirection ?? sectionDirection,
        listItem: true,
      };
      continue;
    }
    if (current?.listItem && /^\s+/.test(rawLine) && trimmed) {
      current.text += ` ${trimmed}`;
      continue;
    }
    if (!trimmed) {
      flush();
      continue;
    }
    if (current?.listItem) flush();
    if (listDirection) listDirection = null;
    if (!current) {
      current = { text: trimmed, fallbackDirection: sectionDirection, listItem: false };
    } else {
      current.text += ` ${trimmed}`;
    }
  }
  flush();
  return units;
}

function artifactActions(text, pattern, direction) {
  return [...text.matchAll(pattern)]
    .filter((match) => {
      if (direction !== "output") return true;
      const prefix = text.slice(0, match.index ?? 0);
      if (/\bany\s+$/i.test(prefix)) return false;
      return !/^verif/i.test(match[0]) || !/\bbefore\b[^.!?;]*$/i.test(prefix);
    })
    .map((match) => ({ ...match, direction }));
}

function directedArtifacts(text, fallbackDirection) {
  const actions = [
    ...artifactActions(text, ARTIFACT_INPUT, "input"),
    ...artifactActions(text, ARTIFACT_OUTPUT, "output"),
  ].sort((left, right) => (left.index ?? 0) - (right.index ?? 0));
  const artifacts = { input: [], output: [] };
  for (const artifact of text.matchAll(ARTIFACT)) {
    const action = actions.filter((candidate) => (candidate.index ?? 0) < (artifact.index ?? 0)).at(-1);
    const actionNegated = action && isNegatedMatch(text, action.index ?? 0);
    const prefix = text.slice(0, artifact.index ?? 0);
    const suffix = text.slice((artifact.index ?? 0) + artifact[0].length);
    const conditionalInput = /\b(?:if|when)\b[^.!?;:]{0,140}$/i.test(prefix) &&
      /^[^.!?;:]{0,100}\b(?:exists?|is present|is absent|is missing|has|contains?|lists?|matches?)\b/i.test(suffix);
    if (conditionalInput) {
      artifacts.input.push(artifact[0]);
    } else if (action && !actionNegated) {
      artifacts[action.direction].push(artifact[0]);
    } else if (!action && fallbackDirection) {
      artifacts[fallbackDirection].push(artifact[0]);
    }
  }
  return artifacts;
}

function artifactContract(description, body) {
  const text = `${description}\n${body}`;
  const artifacts = new Set(text.match(ARTIFACT) ?? []);
  const inputs = new Set();
  const outputs = new Set();
  for (const unit of artifactUnits(description, body)) {
    const directed = directedArtifacts(unit.text, unit.fallbackDirection);
    for (const artifact of directed.input) inputs.add(artifact);
    for (const artifact of directed.output) outputs.add(artifact);
  }
  return {
    artifacts: [...artifacts].sort(),
    inputArtifacts: [...inputs].sort(),
    outputArtifacts: [...outputs].sort(),
  };
}

function matchingTags(body, definitions, includeProhibitions = false) {
  return definitions
    .filter(([, pattern]) => includeProhibitions ? pattern.test(body) : hasPositiveMatch(body, pattern))
    .map(([name]) => name);
}

function behaviorContract(body) {
  return {
    sideEffects: matchingTags(body, [
      ["write-files", /\b(?:Write|Edit) tool\b|\b(?:write|create|update|append) (?:the )?(?:file|artifact)\b/i],
      ["create-worktree", /\b(?:create|add) (?:a |the |one )?(?:home-repo |secondary |git )?worktrees?\b|\bworktree add\b/i],
      ["commit", /\bgit commit\b|\bcreat(?:e|es|ed|ing) (?:an? |one |the )?(?:signed |trailing |atomic )?commits?\b|\bcommitting\b|\bcommit,\s*push\b/i],
      ["push", /\bgit push\b|\bpush (?:each |all |the )?(?:branch|commit)/i],
      ["force-push", /--force-with-lease|force-push/i],
      ["create-pr", /\bgh pr create\b|\bopens? (?:a |the )(?:draft )?(?:pull request|PR)\b/i],
      ["mutate-pr", /\bgh pr (?:edit|ready|review|close|merge)\b|\b(?:edit|undraft|approve|close|merge) (?:the )?(?:pull request|PR)\b/i],
      ["mutate-issue", /\bgh issue (?:create|edit|close)\b|\b(?:create|edit|close) (?:the )?(?:issue|ticket)\b/i],
      ["mutate-project", /\bprojectV2Item|\b(?:move|add) (?:the )?(?:card|ticket|issue)\b|\bmove (?:it|them) (?:to )?(?:backlog|ready|in[- ]progress|in[- ]review|done)\b/i],
      ["delete-state", /\b(?:delete|remove) (?:the )?(?:branch|worktree|directory|file|state)\b|\brm\b/i],
      ["dispatch-agent", /\b(?:Agent|Task) tool\b|\b(?:dispatch|spawn) (?:an? |the )?(?:agent|reviewer|investigator)s?/i],
      ["external-request", /\b(?:curl|gh api|GraphQL|API request)\b/i],
    ]),
    gates: matchingTags(body, [
      ["explicit-intent", /\b(?:explicit|stated) (?:user )?(?:approval|authorization|intent|request)\b/i],
      ["approval", /\b(?:ask for|obtain|require|wait for|receive) (?:the )?(?:user'?s? )?approval\b/i],
      ["prerequisite", /\b(?:precondition|prerequisite|predecessor|required artifact)\b/i],
      ["clean-worktree", /\b(?:clean|dirty) worktree\b/i],
      ["pre-image", /\bpre-image\b|\bbaseline before\b/i],
      ["verification", /\b(?:verify|verification|quality checks?|test suite)\b/i],
      ["review-verdict", /\b(?:review verdict|PASS|FAIL|APPROVE|REQUEST_CHANGES)\b/i],
      ["bounded-loop", /\b(?:bounded|maximum|max) (?:loop|attempt|round|retry|poll)/i],
      ["fail-closed", /\bfail closed\b|\bunknown (?:counts as|is) unsafe\b/i],
    ], true),
  };
}

function behaviorSnapshot(skill, participants, loadedSkills, readSkills) {
  const union = (read) => [...new Set(participants.flatMap(read))].sort();
  return {
    inputs: {
      argument: skill.inputs.argument,
      artifacts: union((entry) => entry.inputs.artifacts),
    },
    outputs: { artifacts: union((entry) => entry.outputs.artifacts) },
    sideEffects: union((entry) => entry.sideEffects),
    gates: union((entry) => entry.gates),
    artifacts: union((entry) => entry.artifacts),
    loadedSkills: [...loadedSkills].sort(),
    readSkills: [...readSkills].sort(),
  };
}

function instructionBlocks(body) {
  const blocks = body
    .split(/\n\s*\n+/)
    .map((block) => block.trim().replace(/\s+/g, " "))
    .filter((block) => words(block) >= 25);
  return [...new Set(blocks)];
}

function median(values) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

export function analyzeFiles(files) {
  const skillPaths = [...files.keys()].filter((path) => SKILL_PATH.test(path)).sort();
  const skills = [];

  for (const path of skillPaths) {
    const directory = path.slice(0, -"/SKILL.md".length);
    const text = files.get(path) ?? "";
    const { frontmatter, rawFrontmatter, body } = splitSkill(text);
    const name = String(frontmatter.name || basename(directory));
    const userInvocable = frontmatter["user-invocable"] !== false;
    const modelInvocable = frontmatter["disable-model-invocation"] !== true;
    const resources = [...files.entries()]
      .filter(([candidate]) => candidate.startsWith(`${directory}/`))
      .filter(([candidate]) => candidate !== path)
      .filter(([candidate]) => !candidate.endsWith("/agents/openai.yaml"));
    const resourceWords = resources.reduce((total, [, content]) => total + words(content), 0);
    const conditionalReferences = resources.filter(([candidate]) => {
      if (!/\.(?:md|txt)$/i.test(candidate)) return false;
      const localPath = candidate.slice(directory.length + 1);
      return body.includes(candidate) || body.includes(localPath);
    });
    const conditionalReferenceWords = conditionalReferences.reduce(
      (total, [, content]) => total + words(content),
      0,
    );
    const description = String(frontmatter.description ?? "");
    const artifacts = artifactContract(description, body);
    const behavior = behaviorContract(body);
    if (artifacts.outputArtifacts.length > 0 && !behavior.sideEffects.includes("write-files")) {
      behavior.sideEffects.unshift("write-files");
    }
    const ui = openaiInterface(files, directory);

    skills.push({
      name,
      path,
      cohort: cohort(name),
      category: name.startsWith("principle-")
        ? "principle"
        : userInvocable
          ? "entry"
          : INTERNAL_PHASES.has(name)
            ? "internal-phase"
            : "methodology",
      lines: text.split("\n").length - (text.endsWith("\n") ? 1 : 0),
      words: words(text),
      bodyWords: words(body),
      rootWords: words(body),
      descriptionWords: words(description),
      resourceWords,
      conditionalReferenceWords,
      totalInstructionWords: words(body) + conditionalReferenceWords,
      userInvocable,
      modelInvocable,
      argumentHint: frontmatter["argument-hint"] ?? null,
      effort: frontmatter.effort ?? null,
      description,
      invocation: {
        name,
        description,
        userInvocable,
        modelInvocable,
        argumentHint: frontmatter["argument-hint"] ?? null,
        effort: frontmatter.effort ?? null,
        ui,
      },
      inputs: {
        argument: frontmatter["argument-hint"] ?? null,
        artifacts: artifacts.inputArtifacts,
      },
      outputs: { artifacts: artifacts.outputArtifacts },
      sideEffects: behavior.sideEffects,
      gates: behavior.gates,
      artifacts: artifacts.artifacts,
      loadedSkills: loadedSkills(body),
      readSkills: readSkills(body, directory, files),
      composedSkills: composedSkills(body),
      citedSkills: referencedSkills(body, directory, files),
      referencedPaths: [
        ...new Set(
          body.match(/(?:(?:\.claude|\.github|docs|skills|agents|hooks|tests|evals|scripts)\/[A-Za-z0-9_${}./<>*-]+|(?:AGENTS|CHANGELOG|README|package|plugin)\.[A-Za-z0-9.]+)/g) ?? [],
        ),
      ].sort(),
      resourceFiles: resources.map(([candidate]) => candidate).sort(),
      conditionalReferenceFiles: conditionalReferences.map(([candidate]) => candidate).sort(),
      headings: body.match(/^#{1,6}\s+.+$/gm) ?? [],
      codeFences: Math.floor((body.match(/^```/gm)?.length ?? 0) / 2),
      rawFrontmatterWords: words(rawFrontmatter),
      blocks: instructionBlocks(body),
    });
  }

  const byName = new Map(skills.map((skill) => [skill.name, skill]));
  function transitive(skill) {
    const visited = new Set([skill.name]);
    const pending = [
      ...skill.loadedSkills.map((name) => ({ name, read: false })),
      ...skill.readSkills.map((name) => ({ name, read: true })),
    ];
    const instructions = [];
    const loaded = new Set();
    const read = new Set();
    let total = 0;
    while (pending.length > 0) {
      const edge = pending.shift();
      const name = edge?.name;
      if (!name) continue;
      const dependency = byName.get(name);
      if (!dependency) continue;
      if (name !== skill.name) {
        if (edge.read) read.add(name);
        else loaded.add(name);
      }
      if (visited.has(name)) continue;
      visited.add(name);
      instructions.push(name);
      total += dependency.totalInstructionWords;
      pending.push(
        ...dependency.loadedSkills.map((child) => ({ name: child, read: false })),
        ...dependency.readSkills.map((child) => ({ name: child, read: true })),
      );
    }
    return {
      loadedSkills: [...loaded].sort(),
      readSkills: [...read].sort(),
      instructionSkills: instructions.sort(),
      words: total,
    };
  }
  function composition(skill) {
    const visited = new Set([skill.name]);
    const pending = [...skill.composedSkills];
    const composed = [];
    while (pending.length > 0) {
      const name = pending.shift();
      if (!name || visited.has(name)) continue;
      visited.add(name);
      const dependency = byName.get(name);
      if (!dependency) continue;
      composed.push(name);
      pending.push(...dependency.composedSkills);
    }
    return composed.sort();
  }
  for (const skill of skills) {
    const dependencies = transitive(skill);
    skill.transitiveLoadedSkills = dependencies.loadedSkills;
    skill.transitiveReadSkills = dependencies.readSkills;
    skill.transitiveInstructionSkills = dependencies.instructionSkills;
    skill.transitiveLoadedWords = dependencies.words;
    skill.bodyAndTransitiveLoadedWords = skill.totalInstructionWords + dependencies.words;
    const composed = composition(skill);
    const participants = composed.map((name) => byName.get(name)).filter(Boolean);
    skill.directBehavior = behaviorSnapshot(skill, [skill], skill.loadedSkills, skill.readSkills);
    skill.effectiveBehavior = behaviorSnapshot(
      skill,
      [skill, ...participants],
      dependencies.loadedSkills,
      dependencies.readSkills,
    );
  }

  const duplicates = new Map();
  for (const skill of skills) {
    for (const block of skill.blocks) {
      const owners = duplicates.get(block) ?? [];
      owners.push(skill.name);
      duplicates.set(block, owners);
    }
    delete skill.blocks;
  }

  const duplicateBlocks = [...duplicates.entries()]
    .filter(([, owners]) => owners.length > 1)
    .map(([text, owners]) => ({ words: words(text), owners: owners.sort(), text }))
    .sort((a, b) => b.words - a.words || a.text.localeCompare(b.text));

  const categories = Object.fromEntries(
    ["entry", "internal-phase", "principle", "methodology"].map((category) => {
      const members = skills.filter((skill) => skill.category === category);
      return [
        category,
        {
          skills: members.length,
          lines: members.reduce((total, skill) => total + skill.lines, 0),
          bodyWords: members.reduce((total, skill) => total + skill.bodyWords, 0),
          medianLines: median(members.map((skill) => skill.lines)),
          medianBodyWords: median(members.map((skill) => skill.bodyWords)),
        },
      ];
    }),
  );
  const cohorts = Object.fromEntries(
    ["principle", "methodology", "qrspi", "read-only-utility", "mutating-utility"].map(
      (name) => {
        const members = skills.filter((skill) => skill.cohort === name);
        return [
          name,
          {
            skills: members.length,
            bodyWords: members.reduce((total, skill) => total + skill.bodyWords, 0),
          },
        ];
      },
    ),
  );

  return {
    summary: {
      skills: skills.length,
      lines: skills.reduce((total, skill) => total + skill.lines, 0),
      bodyWords: skills.reduce((total, skill) => total + skill.bodyWords, 0),
      resourceWords: skills.reduce((total, skill) => total + skill.resourceWords, 0),
      conditionalReferenceWords: skills.reduce(
        (total, skill) => total + skill.conditionalReferenceWords,
        0,
      ),
      totalInstructionWords: skills.reduce(
        (total, skill) => total + skill.totalInstructionWords,
        0,
      ),
      medianLines: median(skills.map((skill) => skill.lines)),
      medianBodyWords: median(skills.map((skill) => skill.bodyWords)),
      duplicateBlocks: duplicateBlocks.length,
      categories,
      cohorts,
    },
    skills,
    duplicateBlocks,
  };
}

function interfaceOf(skill) {
  if (!skill) return null;
  return {
    name: skill.name,
    userInvocable: skill.userInvocable,
    modelInvocable: skill.modelInvocable,
    argumentHint: skill.argumentHint,
    effort: skill.effort,
    triggers: [...skill.description.matchAll(/"([^"]+)"/g)].map((match) => match[1]).sort(),
    ui: skill.invocation.ui,
  };
}

const BEHAVIOR_FIELDS = [
  "inputs",
  "outputs",
  "sideEffects",
  "gates",
  "artifacts",
  "loadedSkills",
  "readSkills",
  "directBehavior",
  "effectiveBehavior",
];

function behaviorOf(skill) {
  if (!skill) return null;
  return Object.fromEntries(BEHAVIOR_FIELDS.map((field) => [field, skill[field]]));
}

function metric(base, current, key) {
  const before = base?.[key] ?? 0;
  const now = current?.[key] ?? 0;
  return { base: before, current: now, delta: now - before };
}

export function compare(current, base, ref) {
  const currentByName = new Map(current.skills.map((skill) => [skill.name, skill]));
  const baseByName = new Map(base.skills.map((skill) => [skill.name, skill]));
  const names = [...new Set([...currentByName.keys(), ...baseByName.keys()])].sort();
  const skills = names.map((name) => {
    const now = currentByName.get(name);
    const before = baseByName.get(name);
    const currentInterface = interfaceOf(now);
    const baseInterface = interfaceOf(before);
    const currentBehaviorContract = behaviorOf(now);
    const baseBehaviorContract = behaviorOf(before);
    return {
      name,
      status: !before ? "added" : !now ? "removed" : "present",
      metrics: Object.fromEntries(
        [
          "lines",
          "words",
          "bodyWords",
          "rootWords",
          "descriptionWords",
          "resourceWords",
          "conditionalReferenceWords",
          "totalInstructionWords",
          "transitiveLoadedWords",
          "bodyAndTransitiveLoadedWords",
        ].map((key) => [key, metric(before, now, key)]),
      ),
      publicInterfaceChanged: JSON.stringify(currentInterface) !== JSON.stringify(baseInterface),
      behaviorContractChanged:
        JSON.stringify(currentBehaviorContract) !== JSON.stringify(baseBehaviorContract),
      behaviorContractChanges: BEHAVIOR_FIELDS.filter(
        (field) =>
          JSON.stringify(baseBehaviorContract?.[field] ?? null) !==
          JSON.stringify(currentBehaviorContract?.[field] ?? null),
      ),
      baseInterface,
      currentInterface,
      baseBehaviorContract,
      currentBehaviorContract,
    };
  });
  return {
    ref,
    summary: {
      skills: current.summary.skills - base.summary.skills,
      lines: current.summary.lines - base.summary.lines,
      bodyWords: current.summary.bodyWords - base.summary.bodyWords,
      resourceWords: current.summary.resourceWords - base.summary.resourceWords,
      conditionalReferenceWords:
        current.summary.conditionalReferenceWords - base.summary.conditionalReferenceWords,
      totalInstructionWords:
        current.summary.totalInstructionWords - base.summary.totalInstructionWords,
      publicInterfaceChanges: skills.filter((skill) => skill.publicInterfaceChanged).length,
      behaviorContractChanges: skills.filter((skill) => skill.behaviorContractChanged).length,
    },
    skills,
  };
}

function parseArgs(argv) {
  const options = { json: false, root: process.cwd(), base: null, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--json") options.json = true;
    else if (argument === "--help" || argument === "-h") options.help = true;
    else if (argument === "--root" || argument === "--base") {
      const value = argv[index + 1];
      if (!value) throw new Error(`${argument} requires a value`);
      options[argument.slice(2)] = value;
      index += 1;
    } else throw new Error(`unknown argument: ${argument}`);
  }
  options.root = resolve(options.root);
  return options;
}

function render(report) {
  const { summary } = report;
  const lines = [
    `Skills: ${summary.skills}`,
    `Lines: ${summary.lines}`,
    `Body words: ${summary.bodyWords}`,
    `Resource words: ${summary.resourceWords}`,
    `Conditional-reference words: ${summary.conditionalReferenceWords}`,
    `Total runtime instruction words: ${summary.totalInstructionWords}`,
    `Median lines: ${summary.medianLines}`,
    `Median body words: ${summary.medianBodyWords}`,
    `Duplicate blocks: ${summary.duplicateBlocks}`,
  ];
  for (const [name, category] of Object.entries(summary.categories)) {
    lines.push(`${name}: ${category.skills} skills, ${category.bodyWords} body words`);
  }
  for (const [name, cohortSummary] of Object.entries(summary.cohorts)) {
    lines.push(`${name}: ${cohortSummary.skills} skills, ${cohortSummary.bodyWords} body words`);
  }
  lines.push("", "Per skill:");
  for (const skill of report.skills) {
    lines.push(
      [
        skill.name,
        `cohort=${skill.cohort}`,
        `lines=${skill.lines}`,
        `body=${skill.bodyWords}`,
        `conditional-references=${skill.conditionalReferenceWords}`,
        `loaded=${skill.loadedSkills.join(",") || "-"}`,
        `read=${skill.readSkills.join(",") || "-"}`,
        `transitive-skills=${skill.transitiveInstructionSkills.join(",") || "-"}`,
        `transitive-reads=${skill.transitiveReadSkills.join(",") || "-"}`,
        `transitive=${skill.transitiveLoadedWords}`,
        `artifacts=${skill.artifacts.join(",") || "-"}`,
        `inputs=${skill.inputs.artifacts.join(",") || "-"}`,
        `outputs=${skill.outputs.artifacts.join(",") || "-"}`,
        `effects=${skill.sideEffects.join(",") || "-"}`,
        `effective-outputs=${skill.effectiveBehavior.outputs.artifacts.join(",") || "-"}`,
        `effective-effects=${skill.effectiveBehavior.sideEffects.join(",") || "-"}`,
        `gates=${skill.gates.join(",") || "-"}`,
        `references=${skill.referencedPaths.join(",") || "-"}`,
      ].join("\t"),
    );
  }
  lines.push("", "Duplicate blocks:");
  if (report.duplicateBlocks.length === 0) lines.push("none");
  for (const block of report.duplicateBlocks) {
    lines.push(`${block.owners.join(",")}\twords=${block.words}\t${block.text}`);
  }
  if (report.comparison) {
    lines.push("", `Compared with: ${report.comparison.ref}`);
    lines.push(`Body word delta: ${report.comparison.summary.bodyWords}`);
    lines.push(`Public interface changes: ${report.comparison.summary.publicInterfaceChanges}`);
    lines.push(`Behavior contract changes: ${report.comparison.summary.behaviorContractChanges}`);
    for (const skill of report.comparison.skills.filter(
      (entry) =>
        entry.status !== "present" || entry.publicInterfaceChanged || entry.behaviorContractChanged,
    )) {
      lines.push(
        `${skill.name}\t${skill.status}\tinterface=${skill.publicInterfaceChanged}` +
          `\tbehavior=${skill.behaviorContractChanged}` +
          `\tbehavior-fields=${skill.behaviorContractChanges.join(",") || "-"}`,
      );
    }
  }
  return `${lines.join("\n")}\n`;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write("Usage: skill-audit.mjs [--json] [--root <path>] [--base <git-ref>]\n");
    return;
  }
  if (!existsSync(join(options.root, "skills")) || !statSync(join(options.root, "skills")).isDirectory()) {
    throw new Error(`skills directory not found under ${options.root}`);
  }
  const report = analyzeFiles(currentFiles(options.root));
  if (options.base) {
    report.comparison = compare(report, analyzeFiles(gitFiles(options.root, options.base)), options.base);
  }
  process.stdout.write(options.json ? `${JSON.stringify(report, null, 2)}\n` : render(report));
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`skill-audit: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

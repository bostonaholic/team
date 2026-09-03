// tests/skill-openai-yaml.test.ts
//
// L2 tripwire (free, deterministic): every skill under `skills/` carries a
// Codex host manifest at `agents/openai.yaml`, and every field in it is
// mechanically derivable from that skill's own `SKILL.md` frontmatter.
//
// The contract, per skill:
//
//   - the file exists, parses, and is a mapping
//   - `interface.display_name` / `short_description` / `default_prompt` are
//     non-empty strings
//   - `display_name` is the kebab `name:` title-cased through two closed
//     lists (uppercase acronyms, lowercase joiners), with a `principle-`
//     prefix rendered as `Principle: `
//   - `short_description` is 25-64 characters inclusive (the Codex spec's own
//     window), opens with a capital, carries no trailing period, and opens
//     with neither an article nor an acronym. The article is the cheap tell
//     for the noun phrase that reads as nonsense after the word "to" below;
//     the period and the acronym both survive the splice into
//     `default_prompt` and render there as `works..` and `sOLID`
//   - `default_prompt` is exactly `Use $<name> to <short_description>.`, using
//     the skill's own declared name as Codex's explicit-invocation token
//   - top-level, `interface`, and `policy` keys stay inside the spec's
//     allowlists
//   - read from the RAW TEXT, not the parse tree: every `interface` value is a
//     double-quoted scalar, no key is quoted, and a `policy` block is exactly
//     `allow_implicit_invocation: false` — present, not merely un-contradicted.
//     `Bun.YAML.parse` returns the same value for `"x"` and `x`, so the parse
//     tree cannot see the spec's style rule at all.
//
// And repo-wide: `short_description` is unique across every skill. A manifest
// declares `allow_implicit_invocation: false` exactly when its frontmatter
// either disables model invocation or identifies an internal phase module
// (`user-invocable: false` plus `argument-hint`). Both sides are rebuilt from
// disk; an empty `policy:` block satisfies neither.
//
// Sibling: tests/guarded-skill-prose.test.ts pins the mutation-guarded subset
// where it appears in prose. This file also covers internal phase modules as
// structured data. Enumeration comes from `skillNames()`
// (tests/helpers/skill-refs.ts), which
// reads `skills/` only — that is what keeps the dev-only `.claude/skills/` out
// of scope by construction, with no exclusion list to drift.
//
// Every check collects offenders and asserts once, so a single run names every
// violator instead of aborting on the first.

import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { skillNames } from "./helpers/skill-refs";
import { frontmatter, read } from "./helpers/text";

const REPO_ROOT = process.cwd();

// The Codex spec's own window for `short_description`, inclusive on both ends.
const SHORT_DESCRIPTION_MIN = 25;
const SHORT_DESCRIPTION_MAX = 64;

// The spec's key allowlists. Anything outside them is a typo or an invention.
const TOP_LEVEL_KEYS = ["interface", "policy"];
const INTERFACE_KEYS = [
  "display_name",
  "short_description",
  "icon_small",
  "icon_large",
  "brand_color",
  "default_prompt",
];
const POLICY_KEYS = ["allow_implicit_invocation"];

// The two closed lists the `display_name` derivation runs on. They are a creep
// fence, the way EXPECTED_GUARDED is in tests/guarded-skill-prose.test.ts: a
// new acronym in a skill name is a decision that must land here.
const ACRONYMS = ["pr", "ux", "qrspi", "solid"];
const JOINERS = ["a", "as", "at", "by", "for", "in", "of", "on", "the", "to"];

// A leading article is the cheap tell for a noun phrase, which reads as
// nonsense spliced after "to" in `default_prompt`.
const ARTICLES = ["a", "an", "the"];

// An acronym is matched by shape, not by list: two or more consecutive capitals
// leading the first word. `promptFor` lowercases only the first character, so
// "SOLID" splices in as "sOLID". A shape check needs no creep fence, and it
// catches an acronym nobody has coined yet.
const LEADING_ACRONYM = /^[A-Z]{2,}/;

// The canonical shape, used as the known-good baseline the three raw-text
// matchers are proved against below.
const SAMPLE_MANIFEST = `interface:
  display_name: "PR Rebase"
  short_description: "Rebase a branch onto its base"
  default_prompt: "Use $pr-rebase to rebase a branch onto its base."

policy:
  allow_implicit_invocation: false
`;

// `display_name` from the skill's kebab `name:`. Split on `-`; uppercase any
// acronym; leave any joiner lowercase unless it leads; else capitalize. A
// `principle-` prefix becomes the literal `Principle: `.
function displayNameFor(name: string): string {
  const isPrinciple = name.startsWith("principle-");
  const rest = isPrinciple ? name.slice("principle-".length) : name;
  const words = rest.split("-").map((token, index) => {
    if (ACRONYMS.includes(token)) return token.toUpperCase();
    if (index > 0 && JOINERS.includes(token)) return token;
    return token.charAt(0).toUpperCase() + token.slice(1);
  });
  return `${isPrinciple ? "Principle: " : ""}${words.join(" ")}`;
}

// `default_prompt`: the one fixed template, over the skill's `name:` and its
// own `short_description` with the first character lowercased.
function promptFor(name: string, shortDescription: string): string {
  const spliced = shortDescription.charAt(0).toLowerCase() + shortDescription.slice(1);
  return `Use $${name} to ${spliced}.`;
}

// --- the three raw-text matchers -------------------------------------------
// Each takes manifest text and returns the offending lines. They are the only
// checks that can see the spec's style rule, and each is proved against a
// known positive under "the sweep can see a positive" below.

// Style rule, value half: every value under `interface:` is a double-quoted
// scalar.
function unquotedInterfaceValues(text: string): string[] {
  const offenders: string[] = [];
  let inInterface = false;
  for (const line of text.split("\n")) {
    if (/^\S/.test(line)) {
      inInterface = /^interface:\s*$/.test(line);
      continue;
    }
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    if (!inInterface) continue;
    const value = line.slice(line.indexOf(":") + 1).trim();
    if (!/^"([^"\\]|\\.)*"$/.test(value)) offenders.push(trimmed);
  }
  return offenders;
}

// Style rule, key half: no key is quoted. A quoted key is the only thing that
// can put a quote character first on a non-comment line.
function quotedKeys(text: string): string[] {
  const offenders: string[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    if (/^["']/.test(trimmed)) offenders.push(trimmed);
  }
  return offenders;
}

// The policy block, when present, is exactly one line with exactly one value.
// `allow_implicit_invocation: true` restates the documented default and is the
// opposite of the safety claim the block exists to make. An EMPTY block is the
// same loss stated more quietly, so it is an offender too: a check that only
// filters out wrong lines reports nothing when every line is gone.
function malformedPolicyLines(text: string): string[] {
  const lines = text.split("\n");
  const start = lines.findIndex((line) => /^policy:\s*$/.test(line));
  if (start === -1) return [];
  const body = lines
    .slice(start + 1)
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"));
  if (body.length === 0) return ["policy: declares nothing"];
  return body.filter((line) => line !== "allow_implicit_invocation: false");
}

// --- enumeration ------------------------------------------------------------

type Manifest = {
  skill: string;
  relative: string;
  exists: boolean;
  raw: string;
  mapping: Record<string, unknown> | null;
  parseError: string;
  declaredName: string;
  requiresExplicitInvocation: boolean;
};

// One record per skill, read once. Every failure value below names the skill,
// so a failure is diagnosable from the assertion output alone.
function manifests(): Manifest[] {
  return [...skillNames(REPO_ROOT)].sort().map((skill) => {
    const relative = join("skills", skill, "agents", "openai.yaml");
    const absolute = join(REPO_ROOT, relative);
    const skillFrontmatter = frontmatter(read(join(REPO_ROOT, "skills", skill, "SKILL.md")));
    const declared = /^name:\s*(\S+)\s*$/m.exec(skillFrontmatter);
    const disablesModelInvocation =
      /^disable-model-invocation:\s*true\s*$/m.test(skillFrontmatter);
    const isInternalPhaseModule =
      /^user-invocable:\s*false\s*$/m.test(skillFrontmatter) &&
      /^argument-hint:/m.test(skillFrontmatter);
    const base = {
      skill,
      relative,
      declaredName: declared?.[1] ?? "",
      requiresExplicitInvocation: disablesModelInvocation || isInternalPhaseModule,
    };
    if (!existsSync(absolute)) {
      return { ...base, exists: false, raw: "", mapping: null, parseError: "" };
    }
    const raw = read(absolute);
    try {
      const parsed: unknown = Bun.YAML.parse(raw);
      const mapping =
        typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
          ? (parsed as Record<string, unknown>)
          : null;
      return { ...base, exists: true, raw, mapping, parseError: mapping ? "" : "not a mapping" };
    } catch (error) {
      // Wrapped so a genuinely malformed file becomes ONE named offender
      // rather than aborting the sweep before every other skill is checked.
      return {
        ...base,
        exists: true,
        raw,
        mapping: null,
        parseError: error instanceof Error ? error.message : String(error),
      };
    }
  });
}

const MANIFESTS = manifests();

// The subset that got far enough to have fields worth checking. Every check
// below runs over this, so a missing or unparseable file is reported exactly
// once, by the check that owns it.
const PARSED = MANIFESTS.filter((m) => m.mapping !== null);

function interfaceBlock(m: Manifest): Record<string, unknown> {
  const block = m.mapping?.["interface"];
  return typeof block === "object" && block !== null && !Array.isArray(block)
    ? (block as Record<string, unknown>)
    : {};
}

function stringField(m: Manifest, field: string): string {
  const value = interfaceBlock(m)[field];
  return typeof value === "string" ? value : "";
}

// --- offender collectors ----------------------------------------------------
// Each returns the offending skills, named, so one run reports every violator.

function missingFile(): string[] {
  return MANIFESTS.filter((m) => !m.exists).map((m) => m.relative);
}

function unparseable(): string[] {
  return MANIFESTS.filter((m) => m.exists && m.mapping === null).map(
    (m) => `${m.skill}: ${m.parseError}`,
  );
}

function missingInterfaceFields(): string[] {
  const required = ["display_name", "short_description", "default_prompt"];
  return PARSED.flatMap((m) =>
    required
      .filter((field) => stringField(m, field).trim() === "")
      .map((field) => `${m.skill}: ${field}`),
  );
}

function wrongDisplayNames(): string[] {
  return PARSED.filter((m) => stringField(m, "display_name") !== displayNameFor(m.declaredName)).map(
    (m) => `${m.skill}: "${stringField(m, "display_name")}" != "${displayNameFor(m.declaredName)}"`,
  );
}

function shortDescriptionsOutsideWindow(): string[] {
  return PARSED.filter((m) => {
    const length = stringField(m, "short_description").length;
    return length < SHORT_DESCRIPTION_MIN || length > SHORT_DESCRIPTION_MAX;
  }).map((m) => `${m.skill}: ${stringField(m, "short_description").length} chars`);
}

function shortDescriptionsOpeningWithAnArticle(): string[] {
  return PARSED.filter((m) => {
    const first = stringField(m, "short_description").split(/\s+/)[0] ?? "";
    return ARTICLES.includes(first.toLowerCase());
  }).map((m) => `${m.skill}: "${stringField(m, "short_description")}"`);
}

function shortDescriptionsNotCapitalized(): string[] {
  return PARSED.filter((m) => {
    const first = stringField(m, "short_description").charAt(0);
    return first !== "" && first !== first.toUpperCase();
  }).map((m) => `${m.skill}: "${stringField(m, "short_description")}"`);
}

// A trailing period survives the splice and renders as `... works..`.
function shortDescriptionsEndingInAPeriod(): string[] {
  return PARSED.filter((m) => stringField(m, "short_description").endsWith(".")).map(
    (m) => `${m.skill}: "${stringField(m, "short_description")}"`,
  );
}

function shortDescriptionsOpeningWithAnAcronym(): string[] {
  return PARSED.filter((m) => LEADING_ACRONYM.test(stringField(m, "short_description"))).map(
    (m) => `${m.skill}: "${stringField(m, "short_description")}"`,
  );
}

function duplicateShortDescriptions(): string[] {
  const seen = new Map<string, string>();
  const duplicates: string[] = [];
  for (const m of PARSED) {
    const value = stringField(m, "short_description");
    const owner = seen.get(value);
    if (owner === undefined) seen.set(value, m.skill);
    else duplicates.push(`${m.skill} duplicates ${owner}: "${value}"`);
  }
  return duplicates;
}

function wrongDefaultPrompts(): string[] {
  return PARSED.filter(
    (m) =>
      stringField(m, "default_prompt") !==
      promptFor(m.declaredName, stringField(m, "short_description")),
  ).map((m) => `${m.skill}: "${stringField(m, "default_prompt")}"`);
}

function keysOutsideAllowlist(
  block: (m: Manifest) => Record<string, unknown>,
  allowed: string[],
): string[] {
  return PARSED.flatMap((m) =>
    Object.keys(block(m))
      .filter((key) => !allowed.includes(key))
      .map((key) => `${m.skill}: ${key}`),
  );
}

function policyBlock(m: Manifest): Record<string, unknown> {
  const block = m.mapping?.["policy"];
  return typeof block === "object" && block !== null && !Array.isArray(block)
    ? (block as Record<string, unknown>)
    : {};
}

function rawTextOffenders(matcher: (text: string) => string[]): string[] {
  return PARSED.flatMap((m) => matcher(m.raw).map((line) => `${m.skill}: ${line}`));
}

function topLevelKeysOutsideAllowlist(): string[] {
  return keysOutsideAllowlist((m) => m.mapping ?? {}, TOP_LEVEL_KEYS);
}

function interfaceKeysOutsideAllowlist(): string[] {
  return keysOutsideAllowlist(interfaceBlock, INTERFACE_KEYS);
}

function policyKeysOutsideAllowlist(): string[] {
  return keysOutsideAllowlist(policyBlock, POLICY_KEYS);
}

// Both sides of the guarded-set equality, each rebuilt from disk. The
// declaration is read POSITIVELY — the value must be there and must be
// `false`. Testing for the `policy` key instead would let a bare `policy:`
// (which parses to null, and whose empty body no line filter can see) stand in
// for the safety claim six prose surfaces make on its behalf.
function skillsDeclaringNoImplicitInvocation(): string[] {
  return PARSED.filter((m) => policyBlock(m)["allow_implicit_invocation"] === false).map(
    (m) => m.skill,
  );
}

function skillsRequiringExplicitInvocation(): string[] {
  return MANIFESTS.filter((m) => m.requiresExplicitInvocation).map((m) => m.skill);
}

// Skills whose frontmatter requires explicit invocation but whose Codex
// manifest omits the corresponding policy.
function explicitOnlyWithoutDeclaration(): string[] {
  const declaring = skillsDeclaringNoImplicitInvocation();
  return skillsRequiringExplicitInvocation().filter((skill) => !declaring.includes(skill));
}

// The other direction: the declaration on a skill that never asked for one.
function declarationWithoutExplicitOnlyContract(): string[] {
  const explicitOnly = skillsRequiringExplicitInvocation();
  return skillsDeclaringNoImplicitInvocation().filter((skill) => !explicitOnly.includes(skill));
}

describe("the sweep can see a positive (L2 tripwire)", () => {
  // docs/testing.md, "Prove a negative check can find a positive": a check
  // that finds nothing has not distinguished absent from blind. Both halves
  // are covered here — an empty-haystack floor, and each raw-text matcher
  // pointed at a known positive.

  test("the enumeration sees every skill", () => {
    // Floors, not exact counts: adding a skill is ordinary work. The `> 50`
    // floor is the one tests/skill-tool-invocation.test.ts:51 puts on skill
    // names alone. Without this, a moved directory or a broken enumerator
    // turns every check below into a permanently green no-op.
    expect(MANIFESTS.length).toBeGreaterThan(50);
  });

  test("the three raw-text matchers report nothing on a well-formed manifest", () => {
    // The known-good baseline. Without it, the three mutation tests below
    // could pass because the matcher fires on everything.
    expect(unquotedInterfaceValues(SAMPLE_MANIFEST)).toEqual([]);
    expect(quotedKeys(SAMPLE_MANIFEST)).toEqual([]);
    expect(malformedPolicyLines(SAMPLE_MANIFEST)).toEqual([]);
  });

  test("the unquoted-value matcher reports a manifest whose value lost its quotes", () => {
    const mutated = SAMPLE_MANIFEST.replace('display_name: "PR Rebase"', "display_name: PR Rebase");

    expect(unquotedInterfaceValues(mutated)).toEqual(["display_name: PR Rebase"]);
  });

  test("the quoted-key matcher reports a manifest whose key gained quotes", () => {
    const mutated = SAMPLE_MANIFEST.replace("  display_name:", '  "display_name":');

    expect(quotedKeys(mutated)).toEqual(['"display_name": "PR Rebase"']);
  });

  test("the policy-line matcher reports a policy block that allows implicit invocation", () => {
    const mutated = SAMPLE_MANIFEST.replace(
      "allow_implicit_invocation: false",
      "allow_implicit_invocation: true",
    );

    expect(malformedPolicyLines(mutated)).toEqual(["allow_implicit_invocation: true"]);
  });

  test("the policy-line matcher reports a policy block that declares nothing", () => {
    // The quiet mutation: the block survives, the claim does not. A filter for
    // wrong lines cannot see this — there are no lines left to be wrong.
    const mutated = SAMPLE_MANIFEST.replace("\n  allow_implicit_invocation: false", "");

    expect(malformedPolicyLines(mutated)).toEqual(["policy: declares nothing"]);
  });
});

describe("every skill has a valid agents/openai.yaml (L2 tripwire)", () => {
  test("every skill directory carries the manifest", () => {
    expect(missingFile()).toEqual([]);
  });

  test("every manifest parses as YAML into a mapping", () => {
    expect(unparseable()).toEqual([]);
  });

  test("every manifest carries three non-empty interface strings", () => {
    expect(missingInterfaceFields()).toEqual([]);
  });

  test("every display_name is the derivation of its skill's own name", () => {
    expect(wrongDisplayNames()).toEqual([]);
  });

  test("every short_description sits inside the spec's 25-64 character window", () => {
    expect(shortDescriptionsOutsideWindow()).toEqual([]);
  });

  test("no short_description opens with an article", () => {
    expect(shortDescriptionsOpeningWithAnArticle()).toEqual([]);
  });

  test("every short_description opens with a capital", () => {
    expect(shortDescriptionsNotCapitalized()).toEqual([]);
  });

  test("no short_description ends in a period", () => {
    expect(shortDescriptionsEndingInAPeriod()).toEqual([]);
  });

  test("no short_description opens with an acronym", () => {
    expect(shortDescriptionsOpeningWithAnAcronym()).toEqual([]);
  });

  test("no two skills share a short_description", () => {
    expect(duplicateShortDescriptions()).toEqual([]);
  });

  test("every default_prompt names the skill and derives from short_description", () => {
    expect(wrongDefaultPrompts()).toEqual([]);
  });

  test("no manifest carries a top-level key outside interface and policy", () => {
    expect(topLevelKeysOutsideAllowlist()).toEqual([]);
  });

  test("no interface block carries a key outside the spec's six", () => {
    expect(interfaceKeysOutsideAllowlist()).toEqual([]);
  });

  test("no policy block carries a key beyond allow_implicit_invocation", () => {
    expect(policyKeysOutsideAllowlist()).toEqual([]);
  });

  test("every interface value is a double-quoted scalar in the raw text", () => {
    expect(rawTextOffenders(unquotedInterfaceValues)).toEqual([]);
  });

  test("no key is quoted in the raw text", () => {
    expect(rawTextOffenders(quotedKeys)).toEqual([]);
  });

  test("every policy block is exactly allow_implicit_invocation: false", () => {
    expect(rawTextOffenders(malformedPolicyLines)).toEqual([]);
  });
});

describe("the explicit-only set and the policy-block set agree in both directions (L2 tripwire)", () => {
  // Both sides are rebuilt from skill frontmatter and manifests on disk.

  test("every explicit-only skill declares allow_implicit_invocation: false", () => {
    expect(explicitOnlyWithoutDeclaration()).toEqual([]);
  });

  test("every skill declaring allow_implicit_invocation: false has an explicit-only contract", () => {
    expect(declarationWithoutExplicitOnlyContract()).toEqual([]);
  });
});

#!/usr/bin/env node

/**
 * Multi-model finding reconciler for the code-review lane.
 *
 * When the `code-reviewer` runs external review CLIs alongside its own pass
 * (see `external-reviewers.mjs`), each model produces a list of findings. This
 * module deduplicates findings that several models independently raised and
 * tags each one with how many distinct models corroborated it — without ever
 * dropping a finding. When two models collide on the same dedup key with
 * different severities, the merged finding carries the MOST SEVERE tier in the
 * group (corroboration must not silently demote a higher-severity flag), while
 * every contributing model's original tier is preserved in `modelTiers` so
 * nothing is lost. Corroboration is annotation-only metadata; the verdict the
 * gate consumes is unchanged.
 *
 * The pure core (`normalizePath`, `normalizeClaim`, `dedupKey`, `reconcile`,
 * `annotate`) is unit-tested at L1. A small CLI lets the agent invoke it
 * deterministically via Bash.
 *
 * STDIN/STDOUT CONTRACT (CLI): reads a JSON findings blob from argv[2] or
 * stdin of shape `{ "byModel": [ { "model": "claude", "findings": [Finding] } ],
 * "totalModels": N }`, where a Finding is `{ file, line, claim, tier?, body? }`.
 * Writes the annotated, reconciled list as a JSON array to stdout. `totalModels`
 * defaults to the number of distinct models present in `byModel`.
 */

import { pathToFileURL } from "node:url";

/**
 * Canonicalize a file path for dedup comparison: trim, convert backslashes to
 * `/`, strip a leading `./`, and collapse repeated slashes. Case is preserved
 * because paths are case-sensitive — two different-cased paths are different
 * files and must not corroborate.
 */
export function normalizePath(p) {
  if (typeof p !== "string") return "";
  let out = p.trim().replace(/\\/g, "/");
  out = out.replace(/^\.\//, "");
  out = out.replace(/\/{2,}/g, "/");
  return out;
}

/**
 * Normalize a finding's claim text for equality: trim, lowercase, collapse
 * internal whitespace runs to a single space, and strip trailing punctuation.
 * Conservative on purpose — it absorbs formatting noise so the same claim
 * corroborates, while genuinely different sentences stay distinct.
 */
export function normalizeClaim(c) {
  if (typeof c !== "string") return "";
  return c
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[.,;:!?]+$/, "");
}

/**
 * Severity rank for a finding's `tier`, highest-wins. The vocabulary mirrors
 * the severity-tier table in `code-review/SKILL.md` (Blocking > Major >
 * Minor) and tolerates the Conventional-Comments labels external CLIs emit
 * (`issue` ≈ Blocking, `suggestion` ≈ Major, `nitpick` ≈ Minor). Lookup is
 * case-insensitive; an unknown or absent tier ranks 0 (below every named
 * tier) so a known tier always wins a tie against an unlabeled finding. This
 * ranking only decides which finding-object's `tier` survives a dedup merge —
 * it does not re-tier findings or alter the SKILL.md tier table.
 */
const SEVERITY_RANK = {
  blocking: 3,
  issue: 3,
  major: 2,
  suggestion: 2,
  minor: 1,
  nitpick: 1,
};

export function severityRank(tier) {
  if (typeof tier !== "string") return 0;
  return SEVERITY_RANK[tier.trim().toLowerCase()] ?? 0;
}

/**
 * The canonical dedup key for a finding:
 * `${normalizePath(file)}::${line}::${normalizeClaim(claim)}`. Two findings
 * corroborate iff their keys are equal (same file, same line, same claim).
 * `line` is intentionally compared by its string coercion — the same
 * deliberate, no-normalization rationale as `normalizePath`/`normalizeClaim`
 * above: a numeric `12` and a string `"12"` denote the same line and must
 * collide, while genuinely different line numbers stay distinct.
 */
export function dedupKey(finding) {
  return `${normalizePath(finding.file)}::${finding.line}::${normalizeClaim(finding.claim)}`;
}

/**
 * Group findings across all models by `dedupKey` and emit one merged finding
 * per group. Default-keep: every input finding lands in exactly one output
 * group; none is dropped. The merged finding's surviving `tier` is the
 * MOST SEVERE tier across the group (see `severityRank`) — corroboration must
 * never silently demote a higher-severity flag a later model raised. The
 * body/fields come from the finding that owns that surviving tier. Each merged
 * finding carries the distinct `models` that raised it, a `corroboration`
 * count (= number of distinct models), and `modelTiers` — the per-model
 * `{ model, tier }` record so every contributing model's original tier is
 * preserved and nothing is lost on merge.
 *
 * Input: an array of `{ model, findings: Finding[] }`.
 */
export function reconcile(findingsByModel) {
  const groups = new Map();
  for (const { model, findings } of findingsByModel ?? []) {
    for (const finding of findings ?? []) {
      const key = dedupKey(finding);
      let group = groups.get(key);
      if (!group) {
        group = { finding, models: new Set(), modelTiers: [] };
        groups.set(key, group);
      } else if (severityRank(finding.tier) > severityRank(group.finding.tier)) {
        // Most severe wins: adopt the higher-severity finding's fields/body.
        group.finding = finding;
      }
      group.models.add(model);
      group.modelTiers.push({ model, tier: finding.tier });
    }
  }
  return [...groups.values()].map(({ finding, models, modelTiers }) => ({
    ...finding,
    models: [...models],
    modelTiers,
    corroboration: models.size,
  }));
}

/**
 * Add an additive `annotation` field to each reconciled finding:
 * `corroborated by N models` when raised by >= 2 distinct models, else
 * `single-model — extra scrutiny`. Annotation never changes `tier` and never
 * drops a finding. `totalModels` is the count of models that ran this round
 * (informational; the per-finding corroboration count drives the phrasing).
 */
export function annotate(merged, _totalModels) {
  return merged.map((finding) => ({
    ...finding,
    annotation:
      finding.corroboration >= 2
        ? `corroborated by ${finding.corroboration} models`
        : "single-model — extra scrutiny",
  }));
}

// CLI entry point — runs only when executed directly, not when imported.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const readInput = async () => {
    if (process.argv[2]) return process.argv[2];
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    return Buffer.concat(chunks).toString("utf8");
  };
  readInput()
    .then((raw) => JSON.parse(raw || "{}"))
    .then((input) => {
      const byModel = Array.isArray(input.byModel) ? input.byModel : [];
      const totalModels =
        typeof input.totalModels === "number"
          ? input.totalModels
          : new Set(byModel.map((m) => m.model)).size;
      const out = annotate(reconcile(byModel), totalModels);
      process.stdout.write(`${JSON.stringify(out)}\n`);
      process.exit(0);
    })
    .catch((err) => {
      process.stderr.write(`reconcile-findings failed: ${err?.message ?? err}\n`);
      process.exit(1);
    });
}

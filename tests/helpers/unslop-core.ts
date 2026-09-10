export interface CoreMeaningChecks {
  zero: boolean;
  one: boolean;
  many: boolean;
}

export const VAGUE_METAPHORS = [
  "center of gravity",
  "moves the needle",
  "surface area",
  "shape of the problem",
  "right seam",
  "unlocks",
  "tees up",
] as const;

export const VAGUE_METAPHOR_REWRITES = {
  "center of gravity": "name the responsible component",
  "moves the needle": "state the measured change",
  "surface area": "name the files, interfaces, or endpoints",
  "shape of the problem": "state the constraints",
  "right seam": "name the boundary",
  unlocks: "enables",
  "tees up": "prepares",
} as const;

export function punctuationRewritePreservesMeaning(line: string): boolean {
  return /\b(?:the\s+)?worker retries once(?:\.|,\s*(?:(?:but|and)\s+)?)\s*the request can still fail\b/i
    .test(line);
}

export function instructionRewritePreservesMeaning(line: string): boolean {
  const text = line.trim();
  if (/\p{Extended_Pictographic}/u.test(text)) return false;
  return /^(?:deploy after (?:the )?tests pass|after (?:the )?tests pass,\s*deploy)\.?$/i
    .test(text);
}

export function normalizedLineCount(text: string): number {
  const normalized = text.replace(/\r\n?/g, "\n");
  return normalized.length === 0 ? 0 : normalized.split("\n").length;
}

export function longestBacktickRun(text: string): number {
  return Math.max(0, ...[...text.matchAll(/`+/g)].map(([run]) => run.length));
}

export function wrapUntrustedEvidence(label: string, text: string): string {
  const fence = "`".repeat(Math.max(3, longestBacktickRun(text) + 1));
  return `${fence}untrusted-evidence-${label}\n${text}\n${fence}`;
}

export function extractUntrustedEvidence(text: string, label: string): string | null {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const opener = new RegExp(`^(` + "`{3,}" + `)untrusted-evidence-${escapedLabel}[ \\t]*$`, "m").exec(text);
  if (!opener || opener.index === undefined) return null;

  const fence = opener[1] ?? "";
  const payloadStart = opener.index + opener[0].length;
  if (text[payloadStart] !== "\n") return null;
  const remainder = text.slice(payloadStart + 1);
  const close = new RegExp(`^${fence}$`, "m").exec(remainder);
  if (!close || close.index === undefined) return null;

  const payload = remainder.slice(0, close.index).replace(/\n$/, "");
  return fence.length > longestBacktickRun(payload) ? payload : null;
}

function termPattern(term: string): RegExp {
  const pattern = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  return new RegExp(`\\b${pattern}\\b`, "i");
}

export function vagueMetaphorTerms(text: string): string[] {
  return VAGUE_METAPHORS.filter((term) => termPattern(term).test(text));
}

export function vagueMetaphorRewritePreservesMeaning(text: string): boolean {
  const owner = markedLine(text, "METAPHOR_OWNER");
  const measurement = markedLine(text, "METAPHOR_MEASUREMENT");
  const endpoint = markedLine(text, "METAPHOR_ENDPOINT");
  const constraint = markedLine(text, "METAPHOR_CONSTRAINT");
  const boundary = markedLine(text, "METAPHOR_BOUNDARY");
  const capability = markedLine(text, "METAPHOR_CAPABILITY");
  const preparation = markedLine(text, "METAPHOR_PREPARATION");
  const reversesInstruction = (line: string): boolean =>
    /\b(?:do not|don't|does not|doesn't|is not|isn't|are not|aren't|cannot|can't|not|never|avoid|without|instead of|rather than|remove|disable|stop)\b/i.test(line);
  return vagueMetaphorTerms(text).length === 0 &&
    ![owner, measurement, constraint, boundary, capability, preparation]
      .some(reversesInstruction) &&
    /\bjob runner handles retries\b/i.test(owner) &&
    /\bcache reduces requests from two to one\b/i.test(measurement) &&
    /\bremove(?:s|d)?\b.*\bstatus endpoint\b/i.test(endpoint) &&
    /\bstale data causes retry failures\b/i.test(constraint) &&
    /\bsplit\b.*\bHTTP boundary\b/i.test(boundary) &&
    /\benables retries\b/i.test(capability) &&
    /\bprepares rollout\b/i.test(preparation);
}

function markedLine(text: string, label: string): string {
  return new RegExp(`^${label}:\\s*(.*)$`, "m").exec(text)?.[1] ?? "";
}

function affirms(
  line: string,
  active: RegExp,
  passive: RegExp,
  negatedClaims: readonly RegExp[],
): boolean {
  return line.length > 0 && !negatedClaims.some((pattern) => pattern.test(line)) &&
    (active.test(line) || passive.test(line));
}

export function unslopCoreMeaningChecks(text: string): CoreMeaningChecks {
  const zero = markedLine(text, "ZERO");
  const one = markedLine(text, "ONE");
  const many = markedLine(text, "MANY");
  return {
    zero: affirms(
      zero,
      /\b(?:the\s+)?API\b.*\b(?:returns?|serves?|provides?)\b.*\bcached data\b/i,
      /\bcached data\b.*\b(?:is|gets?)\s+(?:returned|served|provided)\s+by\b.*\b(?:the\s+)?API\b/i,
      [
        /\bAPI\b.*(?:\b(?:does|did|will|can|may)\s+not\b|\bnever\b|\bno longer\b).*\b(?:return|serve|provide)/i,
        /\bAPI\b.*\b(?:cannot|can['’]t|doesn['’]t|didn['’]t|won['’]t)\s+(?:return|serve|provide)\b.*\bcached data\b/i,
        /\bAPI\b.*\b(?:fails?|refuses?|declines?)\s+to\s+(?:return|serve|provide)\b.*\bcached data\b/i,
        /\bAPI\b.*\b(?:returns?|serves?|provides?)\s+(?:no|zero)\s+cached data\b/i,
        /\b(?:not|without|except(?: for)?|anything but)\s+(?:the\s+)?cached data\b/i,
        /\b(?:no|zero)\s+cached data\b.*\b(?:is|was|gets?)\s+(?:returned|served|provided)\s+by\b.*\bAPI\b/i,
        /\bcached data\b.*\b(?:is|was|gets?)\s+(?:not|never)\s+(?:returned|served|provided)\b/i,
      ],
    ),
    one: affirms(
      one,
      /\boperators?\b.*\bmay\s+(?:use|utilize|select|choose)\b.*\b(?:this\s+)?option\b/i,
      /\b(?:this\s+)?option\b.*\bmay\s+be\s+(?:used|utilized|selected|chosen)\s+by\b.*\boperators?\b/i,
      [
        /\boperators?\b.*\b(?:may\s+not|cannot|can['’]t|are\s+not permitted to)\s+(?:use|utilize|select|choose)\b/i,
        /\b(?:no|zero)\s+operators?\b.*\bmay\s+(?:use|utilize|select|choose)\b.*\boption\b/i,
        /\boperators?\b.*\bmay\s+(?:use|utilize|select|choose)\s+(?:no|zero)\s+option\b/i,
        /\b(?:not|without|except(?: for)?|anything but)\s+(?:this\s+)?option\b/i,
        /\boption\b.*\bmay\s+not\s+be\s+(?:used|utilized|selected|chosen)\b/i,
      ],
    ),
    many: affirms(
      many,
      /\b(?:the\s+)?(?:cache\s+)?module\b.*\b(?:stores?|storing|keeps?|keeping|retains?|retaining|persists?|persisting|records?|recording|saves?|saving)\b.*\brequest IDs?\b/i,
      /\brequest IDs?\b.*\b(?:are|remain)\s+(?:stored|kept|retained|persisted|recorded|saved)\s+by\b.*\b(?:the\s+)?(?:cache\s+)?module\b/i,
      [
        /\b(?:cache\s+)?module\b.*(?:\b(?:does|did|will|can|may)\s+not\b|\bnever\b|\bno longer\b|\bwithout\b|\b(?:stops?|stopped|ceases?|ceased|quits?|quit)\s+).*\b(?:stores?|storing|keeps?|keeping|retains?|retaining|persists?|persisting|records?|recording|saves?|saving)\b.*\brequest IDs?\b/i,
        /\b(?:cache\s+)?module\b.*\b(?:cannot|can['’]t|doesn['’]t|didn['’]t|won['’]t)\s+(?:store|keep|retain|persist|record|save)\b.*\brequest IDs?\b/i,
        /\b(?:cache\s+)?module\b.*\b(?:fails?|refuses?|declines?)\s+to\s+(?:store|keep|retain|persist|record|save)\b.*\brequest IDs?\b/i,
        /\b(?:cache\s+)?module\b.*\bavoids?\s+(?:storing|keeping|retaining|persisting|recording|saving)\b.*\brequest IDs?\b/i,
        /\b(?:cache\s+)?module\b.*\b(?:is|are|was|were)\s+(?:(?:not|never)\s+|no longer\s+)(?:storing|keeping|retaining|persisting|recording|saving)\b.*\brequest IDs?\b/i,
        /\b(?:cache\s+)?module\b.*\b(?:isn['’]t|aren['’]t|wasn['’]t|weren['’]t)\s+(?:storing|keeping|retaining|persisting|recording|saving)\b.*\brequest IDs?\b/i,
        /\b(?:cache\s+)?module\b.*\b(?:stores?|keeps?|retains?|persists?|records?|saves?)\s+(?:no|zero)\s+request IDs?\b/i,
        /\b(?:not|without|except(?: for)?|anything but)\s+(?:the\s+)?request IDs?\b/i,
        /\b(?:no|zero)\s+request IDs?\b.*\b(?:are|were|remain)\s+(?:stored|kept|retained|persisted|recorded|saved)\s+by\b.*\b(?:cache\s+)?module\b/i,
        /\brequest IDs?\b.*\b(?:are|were|remain)\s+(?:not|never)\s+(?:stored|kept|retained|persisted|recorded|saved)\b/i,
      ],
    ),
  };
}

"""ste-lint: score prose drift against the writing-prose skill (dev-only).

Credit: the approach — a small mechanical scorer that reports prose
violations per 100 words — comes from the "cure for AI slop" writing kit at
https://github.com/woosal1337/blog/tree/main/videos/ep01-the-cure-for-ai-slop
(consulted 2026-08-03). That repository declares no license for its code, so
none of its code is used here. This implementation was written from scratch
for this repository: every rule, word list, pattern, and category below
derives from skills/writing-prose/SKILL.md — specifically its self-lint
checklist, its delete list, and its substitution table. The rows this
scorer reads from those tables were added by the same change set that added
this script, so the skill file is the single authority for what counts as
a violation, not an independent second source.

Requires python3 (3.6 or newer); invoke it explicitly:

    python3 .claude/scripts/ste-lint.py [--breakdown] [--cap N] [path ...]

With no paths, or with the path "-", text is read from stdin. The default
sentence cap is 20 words (strict mode in the skill); pass --cap 25 to score
descriptive prose at the STE-flavored cap. The script gates nothing: no
hook, CI workflow, test, or package.json script runs it. Run it by hand to
compare prose against a recorded baseline.

Hard-wrapped markdown is reflowed before sentence segmentation: adjacent
non-blank lines join into one logical paragraph, while each heading, list
item, and table row stays its own unit, so a numbered step list is never
scored as one run-on paragraph.

Known false positive: the contraction check also matches possessives
("file's"). Both need the same human eye, so both are flagged.

Pattern note: no pattern below nests one quantifier inside another, so no
input can trigger catastrophic backtracking.
"""

import argparse
import re
import sys


def verb_forms(base, *irregular):
    """Inflect a verb: base, third-person -s, past, and -ing forms."""
    if irregular:
        return {base, *irregular}
    if base.endswith("e"):
        return {base, base + "s", base + "d", base[:-1] + "ing"}
    third = base + ("es" if base.endswith(("ch", "sh", "s", "x")) else "s")
    return {base, third, base + "ed", base + "ing"}


# Word lists compiled from skills/writing-prose/SKILL.md. Membership is
# curated for a low false-positive rate, so substitution-table rows whose
# left side is a common correct word in software prose (e.g. "may",
# "required", "modify") are left out. Every list is kept alphabetical.

# "Words and phrases to delete" — the skill's three named delete groups.
MARKETING_ADJECTIVES = sorted([
    "battle-tested", "cutting-edge", "effortless", "effortlessly",
    "enterprise-grade", "next-generation", "powerful", "revolutionary",
    "robust", "robustly", "seamless", "seamlessly", "world-class",
])
MODAL_HEDGES = sorted([
    "as mentioned above", "it is important to note", "it is worth noting",
    "it should be noted", "please note that",
])
FILLER = sorted([
    "a variety of", "aforementioned", "due to the fact that", "henceforth",
    "in order to", "in the event that",
])

# "STE word substitutions" — table rows that mark slop reliably.
SUBSTITUTION_WORDS = sorted(
    {
        "additionally", "amongst", "comprehensive", "comprehensively",
        "furthermore", "moreover", "myriad", "numerous", "prior to",
        "utilization", "whilst",
    }
    | verb_forms("acquire")
    | verb_forms("commence")
    | verb_forms("demonstrate")
    | verb_forms("ensure")
    | verb_forms("facilitate")
    | verb_forms("initiate")
    | verb_forms("leverage")
    | verb_forms("obtain")
    | verb_forms("terminate")
    | verb_forms("utilize")
)

# Phrasal verbs the substitution table maps to one plain verb.
PHRASAL_VERBS = sorted(
    "{} {}".format(form, particle)
    for forms, particle in [
        (verb_forms("dive", "dives", "dived", "dove", "diving"), "into"),
        (verb_forms("kick"), "off"),
        (verb_forms("ramp"), "up"),
        (verb_forms("reach"), "out"),
        (verb_forms("spin", "spins", "spun", "spinning"), "up"),
        (verb_forms("tear", "tears", "tore", "torn", "tearing"), "down"),
    ]
    for form in forms
)

# Grammar vocabulary for the token-pair scans below.
BE_FORMS = frozenset("am are be been being is was were".split())
IRREGULAR_PARTICIPLES = frozenset(
    "begun bound broken brought built caught chosen cut done drawn driven "
    "found given gone held hidden kept known laid left lost made meant put "
    "read run seen sent set shown split taken thought thrown understood "
    "written".split()
)
# Light verbs that carry a nominalization ("perform an analysis").
LIGHT_VERBS = frozenset(
    verb_forms("conduct") | verb_forms("execute") | verb_forms("perform")
    | verb_forms("provide") | {"made", "make", "makes"}
)
NOMINAL_SUFFIXES = ("ance", "ence", "ion", "ment", "ysis")

LIST_ITEM = re.compile(r"(?:[*+-]|[0-9]+[.)])\s+")
INLINE_CODE = re.compile(r"`[^`]+`")
CONTRACTION = re.compile(r"\b[a-z]+[’'](?:d|ll|m|re|s|t|ve)\b", re.IGNORECASE)
SENTENCE_SPLIT = re.compile(r"(?<=[.!?])\s+(?=[\"'“‘(]?[A-Z0-9])")
GRAMMAR_TOKEN = re.compile(r"[a-z]+")

# Report order follows the skill's self-lint checklist; the delete list's
# three groups and the substitution table report separately so a drift in
# one group is visible on its own line.
CATEGORIES = [
    "sentence-over-cap", "semicolon", "contraction", "passive-voice",
    "progressive-verb", "nominalization", "phrasal-verb",
    "marketing-adjective", "modal-hedge", "filler", "substitution-word",
    "long-paragraph",
]


def phrase_regex(phrases):
    escaped = "|".join(re.escape(phrase) for phrase in phrases)
    return re.compile(r"\b(?:{})\b".format(escaped), re.IGNORECASE)


MARKETING_RE = phrase_regex(MARKETING_ADJECTIVES)
HEDGE_RE = phrase_regex(MODAL_HEDGES)
FILLER_RE = phrase_regex(FILLER)
SUBSTITUTION_RE = phrase_regex(SUBSTITUTION_WORDS)
PHRASAL_RE = phrase_regex(PHRASAL_VERBS)


def logical_units(text):
    """Reflow markdown into (kind, text) units.

    Kinds: "prose" (a whole logical paragraph, hard wraps undone),
    "list-item" (one item plus its continuation lines), "heading", and
    "table-row". Fenced code is dropped; an inline code span collapses to
    the single placeholder token "code" so it counts as one word.
    """
    units = []
    pending = []
    pending_kind = "prose"

    def flush():
        if pending:
            units.append((pending_kind, " ".join(pending)))
            del pending[:]

    in_fence = False
    for raw_line in text.split("\n"):
        line = raw_line.strip()
        if line.startswith("```"):
            in_fence = not in_fence
            flush()
            continue
        if in_fence:
            continue
        line = INLINE_CODE.sub("code", line)
        if not line:
            flush()
            pending_kind = "prose"
            continue
        if line.startswith("#"):
            flush()
            units.append(("heading", line.lstrip("#").strip()))
            pending_kind = "prose"
            continue
        if line.startswith("|"):
            flush()
            units.append(("table-row", line.strip("|").replace("|", " ")))
            pending_kind = "prose"
            continue
        marker = LIST_ITEM.match(line)
        if marker:
            flush()
            pending_kind = "list-item"
            pending.append(line[marker.end():])
            continue
        if not pending:
            pending_kind = "prose"
        pending.append(line)
    flush()
    return units


def count_words(text):
    return sum(1 for token in text.split() if any(c.isalnum() for c in token))


def grammar_hits(sentence):
    """Count passive, progressive, and nominalization token patterns."""
    passive = progressive = nominal = 0
    tokens = GRAMMAR_TOKEN.findall(sentence.lower())
    for i, token in enumerate(tokens[:-1]):
        if token in BE_FORMS:
            after = tokens[i + 1]
            if (after.endswith("ed") and len(after) >= 4) \
                    or after in IRREGULAR_PARTICIPLES:
                passive += 1
            elif after.endswith("ing") and len(after) >= 5:
                progressive += 1
        if token in LIGHT_VERBS:
            for candidate in tokens[i + 1:i + 4]:
                if len(candidate) >= 6 and candidate.endswith(
                        NOMINAL_SUFFIXES):
                    nominal += 1
                    break
    return passive, progressive, nominal


def score(text, cap):
    units = logical_units(text)
    all_text = "\n".join(unit_text for _, unit_text in units)

    sentence_lengths = []
    passive = progressive = nominal = long_paragraphs = 0
    for kind, unit_text in units:
        if kind not in ("prose", "list-item"):
            continue
        unit_sentences = [
            s for s in SENTENCE_SPLIT.split(unit_text) if s.strip()
        ]
        if kind == "prose" and len(unit_sentences) > 6:
            long_paragraphs += 1
        for sentence in unit_sentences:
            sentence_lengths.append(count_words(sentence))
            hits = grammar_hits(sentence)
            passive += hits[0]
            progressive += hits[1]
            nominal += hits[2]

    counts = {
        "sentence-over-cap": sum(1 for n in sentence_lengths if n > cap),
        "semicolon": all_text.count(";"),
        "contraction": len(CONTRACTION.findall(all_text)),
        "passive-voice": passive,
        "progressive-verb": progressive,
        "nominalization": nominal,
        "phrasal-verb": len(PHRASAL_RE.findall(all_text)),
        "marketing-adjective": len(MARKETING_RE.findall(all_text)),
        "modal-hedge": len(HEDGE_RE.findall(all_text)),
        "filler": len(FILLER_RE.findall(all_text)),
        "substitution-word": len(SUBSTITUTION_RE.findall(all_text)),
        "long-paragraph": long_paragraphs,
    }
    words = sum(count_words(unit_text) for _, unit_text in units)
    violations = sum(counts.values())
    return {
        "words": words,
        "sentences": len(sentence_lengths),
        "counts": counts,
        "violations": violations,
        "per-100-words": (
            round(violations * 100.0 / words, 2) if words else None
        ),
        "em-dashes": all_text.count("—") + all_text.count("–"),
        "longest-sentence": max(sentence_lengths, default=0),
    }


def render(name, result, breakdown):
    rate = result["per-100-words"]
    print(
        "{}: words={} sentences={} violations={} per-100-words={} "
        "em-dashes={} longest-sentence={}".format(
            name, result["words"], result["sentences"],
            result["violations"], "n/a" if rate is None else rate,
            result["em-dashes"], result["longest-sentence"],
        )
    )
    if breakdown and rate is not None:
        for category in CATEGORIES:
            count = result["counts"][category]
            print("  {:<20} {:>3}  ({:.2f} per 100 words)".format(
                category, count, count * 100.0 / result["words"]))


def main(argv):
    parser = argparse.ArgumentParser(
        prog="ste-lint",
        description=(
            "Score prose against the mechanical rules in "
            "skills/writing-prose/SKILL.md, as violations per 100 words."
        ),
        epilog=(
            'With no paths, or with the path "-", text is read from stdin. '
            "The default cap of 20 words is the skill's strict mode; pass "
            "--cap 25 to score descriptive prose at the STE-flavored cap."
        ),
    )
    parser.add_argument(
        "paths", nargs="*", metavar="path",
        help='files to score; "-" or no paths reads stdin',
    )
    parser.add_argument(
        "--breakdown", "-b", action="store_true",
        help="also print per-category violation counts",
    )
    parser.add_argument(
        "--cap", type=int, default=20, metavar="N",
        help="sentence-length cap in words (default: 20)",
    )
    args = parser.parse_args(argv)

    failures = 0
    for path in args.paths or ["-"]:
        if path == "-":
            render("<stdin>", score(sys.stdin.read(), args.cap),
                   args.breakdown)
            continue
        try:
            with open(path, encoding="utf-8") as handle:
                text = handle.read()
        except (OSError, UnicodeDecodeError) as error:
            reason = getattr(error, "strerror", None) or str(error)
            print("ste-lint: {}: {}".format(path, reason), file=sys.stderr)
            failures += 1
            continue
        render(path, score(text, args.cap), args.breakdown)
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))

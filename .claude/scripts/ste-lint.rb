# ste-lint: score prose drift against the writing-prose skill (dev-only).
#
# Credit: the approach — a small mechanical scorer that reports prose
# violations per 100 words — comes from the "cure for AI slop" writing kit at
# https://github.com/woosal1337/blog/tree/main/videos/ep01-the-cure-for-ai-slop
# (consulted 2026-08-03). The kit carries the MIT License, Copyright (c) 2026
# Ege Çelebi. None of its code is used here: this implementation was written
# from scratch for this repository. Its violation categories come from the
# self-lint checklist in skills/writing-prose/SKILL.md, and its word lists
# hold that skill's delete-list rows and a curated subset of its
# substitution-table rows, plus inflected forms of those rows ("seamlessly",
# "comprehensively", "utilization"). The grammar
# vocabulary below (BE_FORMS, IRREGULAR_PARTICIPLES, LIGHT_VERBS,
# NOMINAL_SUFFIXES) is implementation detail for detecting the skill's
# passive-voice and nominalization rules; the skill states those rules in
# prose and lists no such vocabulary. The rows this scorer reads from the
# skill's tables were added by the same change set that added this script,
# so the skill file is the single authority for what counts as a violation,
# not an independent second source.
#
# Requires Ruby (2.6 or newer); invoke it explicitly:
#
#     ruby .claude/scripts/ste-lint.rb [--breakdown] [--cap N] [path ...]
#
# With no paths, or with the path "-", text is read from stdin. The default
# sentence cap is 20 words (strict mode in the skill); pass --cap 25 to score
# descriptive prose at the STE-flavored cap. The script gates nothing: no
# hook, CI workflow, test, or package.json script runs it. Run it by hand to
# compare prose against a recorded baseline.
#
# Hard-wrapped markdown is reflowed before sentence segmentation: adjacent
# non-blank lines join into one logical paragraph, while each heading, list
# item, and table row stays its own unit, so a numbered step list is never
# scored as one run-on paragraph.
#
# Known false positive: the contraction check also matches possessives
# ("file's"). Both need the same human eye, so both are flagged.
#
# Pattern note: every quantified class below is anchored — by \b, \A, a
# lookaround, or a literal delimiter — so backtracking is bounded per token,
# not per character. Measured: scoring stays linear to 4 MB of input.

require "optparse"
require "set"

# Inflect a verb: base, third-person -s, past, and -ing forms.
def verb_forms(base, *irregular)
  return [base, *irregular] unless irregular.empty?
  return [base, "#{base}s", "#{base}d", "#{base[0..-2]}ing"] if base.end_with?("e")

  third = base + (base.end_with?("ch", "sh", "s", "x") ? "es" : "s")
  [base, third, "#{base}ed", "#{base}ing"]
end

# Word lists compiled from skills/writing-prose/SKILL.md. Membership is
# curated for a low false-positive rate, so substitution-table rows whose
# left side is a common correct word in software prose (e.g. "may",
# "required", "modify") are left out. Every list is kept alphabetical.

# "Words and phrases to delete" — the skill's three named delete groups.
MARKETING_ADJECTIVES = %w[
  battle-tested best-in-class blazing-fast cutting-edge disruptive
  effortless effortlessly enterprise-grade game-changing next-generation
  powerful revolutionary robust robustly seamless seamlessly
  state-of-the-art world-class
].sort.freeze
MODAL_HEDGES = [
  "as mentioned above", "it is important to note", "it is worth noting",
  "it should be noted", "please note that"
].sort.freeze
FILLER = [
  "a variety of", "aforementioned", "due to the fact that", "henceforth",
  "in order to", "in the event that"
].sort.freeze

# "STE word substitutions" — table rows that mark slop reliably.
SUBSTITUTION_WORDS = (
  [
    "additionally", "amongst", "comprehensive", "comprehensively",
    "furthermore", "moreover", "myriad", "numerous", "prior to",
    "utilization", "whilst"
  ] +
  verb_forms("acquire") + verb_forms("commence") + verb_forms("demonstrate") +
  verb_forms("ensure") + verb_forms("facilitate") + verb_forms("initiate") +
  verb_forms("leverage") + verb_forms("obtain") + verb_forms("terminate") +
  verb_forms("utilize")
).uniq.sort.freeze

# Phrasal verbs the substitution table maps to one plain verb.
PHRASAL_VERBS = [
  [verb_forms("dive", "dives", "dived", "dove", "diving"), "into"],
  [verb_forms("kick"), "off"],
  [verb_forms("ramp"), "up"],
  [verb_forms("reach"), "out"],
  [verb_forms("spin", "spins", "spun", "spinning"), "up"],
  [verb_forms("tear", "tears", "tore", "torn", "tearing"), "down"]
].flat_map { |forms, particle| forms.map { |form| "#{form} #{particle}" } }
  .sort.freeze

# Grammar vocabulary for the token-pair scans below.
BE_FORMS = Set.new(%w[am are be been being is was were]).freeze
IRREGULAR_PARTICIPLES = Set.new(%w[
  begun bound broken brought built caught chosen cut done drawn driven
  found given gone held hidden kept known laid left lost made meant put
  read run seen sent set shown split taken thought thrown understood
  written
]).freeze
# Light verbs that carry a nominalization ("make an assessment").
LIGHT_VERBS = Set.new(
  verb_forms("conduct") + verb_forms("execute") + verb_forms("perform") +
  verb_forms("provide") + %w[made make makes]
).freeze
NOMINAL_SUFFIXES = %w[ance ence ion ment ysis].freeze

LIST_ITEM = /\A(?:[*+-]|[0-9]+[.)])\s+/.freeze
INLINE_CODE = /`[^`]+`/.freeze
CONTRACTION = /\b[a-z]+[’'](?:d|ll|m|re|s|t|ve)\b/i.freeze
SENTENCE_SPLIT = /(?<=[.!?])\s+(?=["'“‘(]?[A-Z0-9])/.freeze
GRAMMAR_TOKEN = /[a-z]+/.freeze

# Report order follows the skill's self-lint checklist; the delete list's
# three groups and the substitution table report separately so a drift in
# one group is visible on its own line.
CATEGORIES = %w[
  sentence-over-cap semicolon contraction passive-voice
  progressive-verb nominalization phrasal-verb
  marketing-adjective modal-hedge filler substitution-word
  long-paragraph
].freeze

def phrase_regex(phrases)
  escaped = phrases.map { |phrase| Regexp.escape(phrase) }.join("|")
  Regexp.new("\\b(?:#{escaped})\\b", Regexp::IGNORECASE)
end

MARKETING_RE = phrase_regex(MARKETING_ADJECTIVES)
HEDGE_RE = phrase_regex(MODAL_HEDGES)
FILLER_RE = phrase_regex(FILLER)
SUBSTITUTION_RE = phrase_regex(SUBSTITUTION_WORDS)
PHRASAL_RE = phrase_regex(PHRASAL_VERBS)

# Reflow markdown into [kind, text] units.
#
# Kinds: "prose" (a whole logical paragraph, hard wraps undone),
# "list-item" (one item plus its continuation lines), "heading", and
# "table-row". Fenced code is dropped; an inline code span collapses to
# the single placeholder token "code" so it counts as one word.
def logical_units(text, source)
  units = []
  pending = []
  pending_kind = "prose"

  flush = lambda do
    unless pending.empty?
      units << [pending_kind, pending.join(" ")]
      pending.clear
    end
  end

  in_fence = false
  text.split("\n").each do |raw_line|
    line = raw_line.strip
    if line.start_with?("```")
      in_fence = !in_fence
      flush.call
      next
    end
    next if in_fence

    line = line.gsub(INLINE_CODE, "code")
    if line.empty?
      flush.call
      pending_kind = "prose"
      next
    end
    if line.start_with?("#")
      flush.call
      units << ["heading", line.sub(/\A#+/, "").strip]
      pending_kind = "prose"
      next
    end
    if line.start_with?("|")
      flush.call
      units << ["table-row", line.gsub(/\A\|+|\|+\z/, "").tr("|", " ")]
      pending_kind = "prose"
      next
    end
    marker = LIST_ITEM.match(line)
    if marker
      flush.call
      pending_kind = "list-item"
      pending << line[marker.end(0)..-1]
      next
    end
    pending_kind = "prose" if pending.empty?
    pending << line
  end
  flush.call
  if in_fence
    warn "ste-lint: #{source}: warning: a code fence is still open at end " \
         "of input; text inside it was not scored"
  end
  units
end

def count_words(text)
  text.split.count { |token| token =~ /[[:alnum:]]/ }
end

# Count passive, progressive, and nominalization token patterns.
def grammar_hits(sentence)
  passive = progressive = nominal = 0
  tokens = sentence.downcase.scan(GRAMMAR_TOKEN)
  (0...tokens.length - 1).each do |i|
    token = tokens[i]
    if BE_FORMS.include?(token)
      after = tokens[i + 1]
      if (after.end_with?("ed") && after.length >= 4) ||
         IRREGULAR_PARTICIPLES.include?(after)
        passive += 1
      elsif after.end_with?("ing") && after.length >= 5
        progressive += 1
      end
    end
    next unless LIGHT_VERBS.include?(token)

    tokens[i + 1, 3].each do |candidate|
      if candidate.length >= 6 && candidate.end_with?(*NOMINAL_SUFFIXES)
        nominal += 1
        break
      end
    end
  end
  [passive, progressive, nominal]
end

def score(text, cap, source)
  units = logical_units(text, source)
  all_text = units.map { |_, unit_text| unit_text }.join("\n")

  sentence_lengths = []
  passive = progressive = nominal = long_paragraphs = 0
  units.each do |kind, unit_text|
    next unless kind == "prose" || kind == "list-item"

    unit_sentences = unit_text.split(SENTENCE_SPLIT)
                              .reject { |sentence| sentence.strip.empty? }
    long_paragraphs += 1 if kind == "prose" && unit_sentences.length > 6
    unit_sentences.each do |sentence|
      sentence_lengths << count_words(sentence)
      hits = grammar_hits(sentence)
      passive += hits[0]
      progressive += hits[1]
      nominal += hits[2]
    end
  end

  counts = {
    "sentence-over-cap" => sentence_lengths.count { |length| length > cap },
    "semicolon" => all_text.count(";"),
    "contraction" => all_text.scan(CONTRACTION).length,
    "passive-voice" => passive,
    "progressive-verb" => progressive,
    "nominalization" => nominal,
    "phrasal-verb" => all_text.scan(PHRASAL_RE).length,
    "marketing-adjective" => all_text.scan(MARKETING_RE).length,
    "modal-hedge" => all_text.scan(HEDGE_RE).length,
    "filler" => all_text.scan(FILLER_RE).length,
    "substitution-word" => all_text.scan(SUBSTITUTION_RE).length,
    "long-paragraph" => long_paragraphs
  }
  words = units.sum { |_, unit_text| count_words(unit_text) }
  violations = counts.values.sum
  {
    "words" => words,
    "sentences" => sentence_lengths.length,
    "counts" => counts,
    "violations" => violations,
    "per-100-words" => words.zero? ? nil : (violations * 100.0 / words).round(2),
    "em-dashes" => all_text.count("—") + all_text.count("–"),
    "longest-sentence" => sentence_lengths.max || 0
  }
end

def render(name, result, breakdown)
  rate = result["per-100-words"]
  puts format(
    "%s: words=%d sentences=%d violations=%d per-100-words=%s " \
    "em-dashes=%d longest-sentence=%d",
    name, result["words"], result["sentences"], result["violations"],
    rate.nil? ? "n/a" : rate, result["em-dashes"], result["longest-sentence"]
  )
  return unless breakdown && !rate.nil?

  CATEGORIES.each do |category|
    count = result["counts"][category]
    puts format("  %-20s %3d  (%.2f per 100 words)",
                category, count, count * 100.0 / result["words"])
  end
end

def main(argv)
  breakdown = false
  cap = 20
  parser = OptionParser.new do |options|
    options.banner = "usage: ste-lint [--breakdown] [--cap N] [path ...]\n\n" \
      "Score prose against the mechanical rules in " \
      "skills/writing-prose/SKILL.md,\nas violations per 100 words.\n\n"
    options.on("-b", "--breakdown",
               "also print per-category violation counts") do
      breakdown = true
    end
    options.on("--cap N", Integer,
               "sentence-length cap in words (default: 20)") do |value|
      cap = value
    end
    options.on("-h", "--help", "show this help message and exit") do
      puts options
      puts 'With no paths, or with the path "-", text is read from stdin. ' \
        "The default\ncap of 20 words is the skill's strict mode; pass " \
        "--cap 25 to score\ndescriptive prose at the STE-flavored cap."
      exit 0
    end
  end

  begin
    paths = parser.parse(argv)
  rescue OptionParser::ParseError => error
    warn "ste-lint: #{error.message}"
    warn parser.banner
    return 2
  end

  failures = 0
  (paths.empty? ? ["-"] : paths).each do |path|
    if path == "-"
      text = $stdin.read.force_encoding("UTF-8")
      unless text.valid_encoding?
        warn "ste-lint: <stdin>: invalid byte sequence in UTF-8"
        failures += 1
        next
      end
      render("<stdin>", score(text, cap, "<stdin>"), breakdown)
      next
    end
    begin
      text = File.read(path, encoding: "UTF-8")
      unless text.valid_encoding?
        raise ArgumentError, "invalid byte sequence in UTF-8"
      end
    rescue SystemCallError => error
      warn "ste-lint: #{path}: #{error.class.new.message}"
      failures += 1
      next
    rescue ArgumentError => error
      warn "ste-lint: #{path}: #{error.message}"
      failures += 1
      next
    end
    render(path, score(text, cap, path), breakdown)
  end
  failures.zero? ? 0 : 1
end

exit main(ARGV) if $PROGRAM_NAME == __FILE__

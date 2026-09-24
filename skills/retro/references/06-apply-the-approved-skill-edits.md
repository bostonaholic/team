## Apply the approved skill edits

The plan turn ends here. Applying the plan is a **separate turn** that reads
the plan file.

### The approval question

Ask one `AskUserQuestion` for the whole skill-write class, presenting each
proposed edit with its target path, the learning it lands, and its evidence
line. Nothing is written before the answer. No answer writes nothing; a
partial answer writes only the subset that was answered.

One question for the class is enough **because of the precondition below**, not
instead of it. Every write is either a file retro created — undone by
deleting the named path — or an edit to a file that was tracked and clean when
retro wrote it, undone by `git restore -- <path>`. Neither undo can reach
work of the user's own. A tracker issue is not in this class: it is public and
irreversible, so it takes its own question per issue.

### The plan path came from this conversation

Apply the plan file in the run cache whose absolute path **this conversation
printed**. Never read a plan file from a directory this conversation did not
print. With no printed path — a fresh session, or a compaction that lost it —
stop and fire `AskUserQuestion` for the absolute plan path rather than
guessing at one.

### Per item: the precondition that makes the undo true

Hold an edit to the tracked-and-clean fence; hold a creation to the absence of
its target.

**An edit** is applied only while its target is tracked and clean:

```sh
git ls-files --error-unmatch -- "<path>"   # not tracked -> skip this item
git status --porcelain -- "<path>"         # non-empty -> skip this item
```

An item that fails either check is **skipped** with the reason reported, never
written. Then re-read the target and compare it against the **pre-image** the
plan recorded. Any difference skips that item and reports it, which covers a
target that already carries the edit and a target that changed some other way.

**A creation** is applied only while its named path does not exist. A path
that does exist skips that item and reports it, because retro overwrites
nothing it did not create.

### Where a write may land

Resolve the target through the bundled guard rather than by hand — the name
comes from transcript text, so it is untrusted. **The name never appears in a
command as a literal.** Write it into the run cache with the file-writing tool,
then read it back and hold it to a character allowlist before it reaches
anything else:

```sh
NAME="$(cat "<run cache>/name-<n>.txt")"   # substitution output is not re-parsed
LC_ALL=C                     # in a UTF-8 locale the bracket set is collation-dependent
case "$NAME" in
  ''|-*|*[!a-z0-9-]*)
    echo "refusing: a proposed name must be a skill name, lowercase and hyphenated" >&2
    exit 1 ;;
esac
node "<skill-dir>/resources/write-target.mjs" "$(git rev-parse --show-toplevel)" "${NAME:?}"
```

Reference the value only as `"$NAME"` and never paste the literal into a later
command; shell state does not survive between invocations, so the file is
re-read and the repository root re-derived in whichever invocation needs them,
rather than read back from an earlier block's variable.

- **A name** the allowlist or the guard's name check refuses drops only that
  one item, named in the summary, while the others proceed.
- **An edit** lands under the guard's `edit root`, the skills root the running
  host actually loads. When both `<repo>/skills/` and `<repo>/.claude/skills/`
  hold the same name, the plan names both paths and marks the shadowed one
  untouched.
- **A creation** only ever targets `.claude/skills/<name>/SKILL.md` under the
  repository, and only when that path does not exist. A missing parent
  directory is created as part of the write.
- **Every resolved real path must stay inside the repository**, so a symlinked
  directory cannot carry a write out of it.
- **Never write** `~/.claude/**` (a plugin update overwrites cached skills), a
  sibling repository, or `agents/*.md`.

### How the edit is authored

Probe for the repo's own authoring guidance and follow the first hit:
`.claude/skills/create-team-skill/`, then any repo skill whose directory name
matches `create-*skill*`, then an installed host `skill-creator`. A miss at
every tier is not an error — the fallback is fixed here:

- `name` and `description` always.
- The description starts with one concise semantic use condition; add a second
  only for distinct intent. Do not quote exact requests or repeat `/<name>`.
- `argument-hint` **and** `effort` together when the skill is user-invocable.
- `user-invocable: false` and **no** `effort` otherwise.
- No other frontmatter field.

### After the writes

Run the repo's own check — read the [verify playbook](../team/playbooks/verify.md)
to detect it, never invent one — and report the verdict. A failure names the
failing test and the file written. Reflect neither fixes the failure nor
reverts the write. Where the repo configures no check, say that none ran.

## Execution

### Step 1 — open the run cache

Create the run's cache directory first and print its absolute path:

```bash
RUN_DIR="$(mktemp -d "${TMPDIR:-/tmp}/reflect.XXXXXXXX")" \
  || { echo "cannot create the run cache — stopping" >&2; exit 1; }
echo "run cache: $RUN_DIR"
```

`mktemp -d` creates the directory in one atomic step, under an unguessable name
readable only by its owner. The cache holds the normalized transcript and the
plan file, both of which carry session text. A cache that cannot be created
stops the run rather than falling back to memory.

That printed path does double duty. It is **this run's marker**: the host
records command output inline in the transcript, so the path appears in this
session's records and in no other file on disk. Step 2 resolves the session by
searching for it.

A **run** is one invocation plus every later turn that answers its approval
question, named by the one directory whose absolute path this conversation
printed. Shell state does not survive between invocations, so later commands
take that absolute path literally rather than reading `$RUN_DIR` again. The
cache is disposable and is **never deleted**, so the report stays auditable
after the run ends.

### Step 2 — resolve and normalize this session's transcript

```bash
node "<skill-dir>/resources/resolve-transcript.mjs" "<the printed run cache path>"
```

Substitute `<skill-dir>` with this skill's own directory. Never interpolate a
host variable into it: `${CLAUDE_PLUGIN_ROOT}` exists on Claude Code alone, so
a command carrying it breaks on every other host.

The script resolves one absolute transcript path or fails by name, and it
writes `transcript.jsonl` into the run cache: one classified record per line,
each span cut to the per-span byte cap. A tool call normalizes to its tool name
plus its invocation, which is what leaves the tooling lens an invocation to
count. **The lenses read only that normalized file.** Three rules therefore run
as code rather than as advice — the record classifier, the byte cap, and never
opening a `tool-results/*.txt` sidecar.

Its search is a **fixed-string** match for the marker over the transcripts one
level under `~/.claude/projects`, and it **returns file names only**. So no
unmatched session's content reaches a lens, a proposal, or this context, which
is what makes searching wider than one project directory acceptable. Three
named failures stop the run instead of guessing:

| Failure | What it means | What to report |
|---------|---------------|----------------|
| `no-projects-root` | the host records no transcripts here | the path tried; reflect works on Claude Code only |
| `no-match` | the marker has not reached disk after one retry | both search patterns tried |
| `multiple-matches` | an invariant violation, since the marker is unique to this run | every path matched, and no pick |

Read the script's counts into the report: records kept, records dropped per
type, records dropped to the aggregate ceiling, spans truncated, and malformed
lines skipped. A session whose transcript was bounded produced a partial read,
and the summary says so.

### Step 3 — send the lenses over the normalized file

Dispatch the three lenses below in one message, then synthesize their replies.

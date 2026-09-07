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

That printed path does double duty. It is **this run's fallback marker**: the
host records command output inline in the transcript, so the path appears in
this session's records and in no other file on disk. Step 2 searches for it on
a host that exports no session id of its own.

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
each span cut to the per-span byte cap. **The lenses read only that normalized
file.** Every host's records land in the same shape — real user prompts,
assistant replies, and tool calls rendered as the tool's name plus its
invocation, which is what leaves the tooling lens an invocation to count. Four
rules therefore run as code rather than as advice: the record classifier, the
byte cap, the record and byte ceilings, and never descending past a
transcript's own directory level into a `subagents/` or `tool-results/` sidecar.

**Which store it reads.** Claude Code keeps `<session-id>.jsonl` under
`~/.claude/projects/<project-slug>/`; Codex keeps
`rollout-<timestamp>-<thread-id>.jsonl` under
`${CODEX_HOME:-~/.codex}/sessions/<YYYY>/<MM>/<DD>/`. **Conductor is not a
store.** It runs Claude Code, Codex, Cursor Agent, or OpenCode inside a
worktree, and the backend writes its transcript in its own place unchanged — so
a Conductor session resolves as whichever backend it runs, and the two backends
this skill cannot read fail as `unsupported-host` rather than as something
plausible.

**How the session is identified.** The host's own exported id first
(`CLAUDE_CODE_SESSION_ID`, `CODEX_THREAD_ID`), which names the file directly and
is re-checked against the file's own header. Only where a host exports none does
the run fall back to a **fixed-string** search for the marker across that host's
store. **Neither path returns a transcript's content**: the marker search
returns file names only, and the header check returns only the id it read. So
no unmatched session's content reaches a lens, a proposal, or this context,
which is what makes searching wider than one directory acceptable. Nothing takes
the newest file, guesses from the working directory, or picks among candidates.
Named failures stop the run instead:

| Failure | What it means | What to report |
|---------|---------------|----------------|
| `unsupported-host` | neither supported agent exported a session id here | the host, and that reflect reads Claude Code and Codex stores — Conductor through whichever of the two it runs |
| `ambiguous-host` | two agents claim this process — one is running inside the other's shell — and the marker settled neither transcript | both hosts named; no pick was made |
| `invalid-session-id` | the exported id is not a session id shape | the value seen |
| `no-session-store` | the host records no transcripts here | the path tried |
| `no-match` | neither the session id nor the marker reached disk after one retry | every pattern tried |
| `multiple-matches` | an invariant violation, since both signals are unique to this run | every path matched, and no pick |
| `unsupported-format` | the resolved file holds no records any supported host writes | the path, and the unrecognized-record count |

Read the script's counts into the report: the host and whether the session was
resolved by id or by marker, the format, records kept, records dropped per
type, records dropped to the aggregate ceiling, spans truncated, malformed
lines skipped, unrecognized records, and any prior history the file does not
carry. **A bounded or partial read is stated, never absorbed.** A session
whose transcript hit a ceiling produced a partial read; a Codex thread forked
from another one leaves its earlier turns in the parent's file, which this run
does not read. Say so in the summary either way, and **never substitute your own
memory of the session for the part the transcript did not carry** — that memory
is what compaction already discarded, which is the reason the run reads a file
at all.

### Step 3 — send the lenses over the normalized file

Dispatch the three lenses below in one message, then synthesize their replies.

## Execution

### Step 1 — open the run cache

Create the run's cache directory first and print its absolute path:

```bash
RUN_DIR="$(mktemp -d "${TMPDIR:-/tmp}/retro.XXXXXXXX")" \
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
with every allowlisted record and its complete text preserved. **The lenses read
only that normalized file**, in consecutive chunks until its end. Do not select
only recent records or truncate long entries to fit a single tool response or
context window. Track the last record read when continuing across chunks.
Every host's records land in the same shape — real user prompts, assistant
replies, and tool calls rendered as the tool's name plus its invocation.
The record classifier and the prohibition on descending into `subagents/` or
`tool-results/` sidecars remain enforced in code. There is no per-span,
record-count, or aggregate-size limit on the normalized transcript.

**Which store it reads.** Claude Code keeps `<session-id>.jsonl` under
`~/.claude/projects/<project-slug>/`; Codex keeps
`rollout-<timestamp>-<thread-id>.jsonl` under
`${CODEX_HOME:-~/.codex}/sessions/<YYYY>/<MM>/<DD>/`; OpenCode keeps its
sessions in a SQLite database at `$OPENCODE_DB`, defaulting to
`${XDG_DATA_HOME:-~/.local/share}/opencode/opencode.db`. **Conductor is not a
store.** It runs Claude Code, Codex, Cursor Agent, or OpenCode inside a
worktree, and the backend writes its transcript in its own place unchanged — so
a Conductor session resolves as whichever backend it runs, and Cursor Agent,
which this skill does not read, fails as `unsupported-host` rather than as
something plausible.

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
| `unsupported-host` | neither supported agent exported a session id here | the host, and that retro reads Claude Code, Codex, and OpenCode stores — Conductor through whichever of those it runs |
| `ambiguous-host` | two agents claim this process — one is running inside the other's shell — and the marker settled neither transcript | both hosts named; no pick was made |
| `ambiguous-session` | more than one childless OpenCode session carries this run's marker | every session id matched, and no pick |
| `invalid-session-id` | the exported id is not a session id shape | the value seen |
| `no-session-store` | the host records no transcripts here | the path tried |
| `no-match` | neither the session id nor the marker reached the store after one retry | every pattern tried |
| `multiple-matches` | an invariant violation, since both signals are unique to this run | every path matched, and no pick |
| `sqlite-unavailable` | this runtime cannot load the built-in `node:sqlite` module | the database path tried |
| `unreadable-session-store` | the OpenCode store lacks a required table or column, or a read of it failed | the database path tried |
| `unsupported-format` | the resolved store holds no records any supported host writes | the store, and the unrecognized-record count |

Read the script's counts into the report: the host and whether the session was
resolved by id or by marker, the format, records kept, records dropped per
type, records dropped to the aggregate ceiling, spans truncated, malformed
lines skipped, unrecognized records, and any prior history the file does not
carry. **A partial read is stated, never absorbed.** A Codex thread forked from
another one leaves its earlier turns in the parent's file, which this run does
not read. If a lens cannot finish reading, report its unread record range. Say
so in the summary, and **never substitute your own
memory of the session for the part the transcript did not carry** — that memory
is what compaction already discarded, which is the reason the run reads a file
at all.

### Step 3 — send the lenses over the normalized file

Dispatch the three lenses below in one message, then synthesize their replies.

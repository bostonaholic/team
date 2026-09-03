---
name: principle-never-interpolate
description: "Apply at shell boundaries: pass external values as data, never command text."
user-invocable: false
---

# Never Interpolate

**Invariant:** Untrusted prose never enters shell command text; only byte-exact
allowlisted scalars may enter it.

**Rules:**
- Quoting and heredocs do not make interpolation safe. Send prose through a
  file (`--body-file`, `-F body=@-`), stdin, or the environment into a declared
  command that runs verbatim without editing or re-quoting.
- Validate branch names, IDs, and other scalars with a character allowlist and
  `LC_ALL=C`. Refuse failures; never normalize them. Syntax checks do not replace
  the allowlist.
- Use `--` where a value could be parsed as an option. It may be omitted only
  when position fixes the role and the allowlist excludes leading `-`.
- Before destructive use, require paths under the expected root with no `..`
  and no symlink.
- Capture, validate, and use a value in one invocation. Expand destructive or
  gate inputs as `"${VAR:?}"`; guard values used inside command substitution
  first with standalone `: "${VAR:?}"`.

**Check:** Can any external byte reach command text without same-invocation
validation?

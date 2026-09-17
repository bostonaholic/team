# Packaged runtime startup

Only the invoking root session initializes a runtime. Nested calls and subagents inherit root and mode, without initialization.
Resolve <skill-dir> from the host-supplied absolute base of this loaded skill, never from the consumer checkout.
Pass that installation path without resolving its registration links.
If that base is unavailable, stop and report "missing absolute skill base".
Resolve <consumer-root> from the host's absolute consumer project root, separately from the installed skill base.
If that root is unavailable, stop and report "missing absolute consumer project root". Never infer it from the invocation subdirectory.
Run this command with each absolute path quoted as a separate argument:

```sh
node "<skill-dir>/runtime/resolve.mjs" "<consumer-root>"
```

If Node is missing, stop and report "missing Node runtime". On nonzero exit, report the resolver diagnostic and stop.
Parse the returned JSON mode, root, and skillPath. Preserve these values for every nested operation.
In plugin mode, continue this original procedure with the native root. Native resolution writes nothing.
In skills mode, read skillPath and apply that canonical procedure with the original arguments and explicit invocation context.
Read <root>/skills/team/references/skill-dispatch.md before nested invocation or continuation guidance.

Packaged initialization permits only this root session's fresh private temporary writes and failed-initialization cleanup.
Read-only commands permit this exception before workflow work. Subagents never receive it.
It permits no project, installation, configuration, workflow, or external-service writes.
Keep project paths, artifacts, Git operations, and configuration relative to the consumer project.
Successful private directories remain readable for active agents until operating-system temporary cleanup. Do not retry or delete another invocation's directory.

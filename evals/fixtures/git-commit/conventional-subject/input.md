---
agent: git-commit
tier: periodic
deps:
  - skills/team-pr/**
---

# Self-contained task: author a Conventional Commit for a staged diff

You are committing the staged change below. Produce a single commit message
that follows the git-commit methodology: a Conventional-Commit subject of the
shape `<type>[optional scope]: <description>`, imperative mood, capitalized
first word after the type prefix, no trailing period, kept under 50 characters,
followed by a blank line and a body that explains the *why*.

The staged diff (only material change in the slice):

```diff
diff --git a/src/auth/session.js b/src/auth/session.js
index 1a2b3c4..5d6e7f8 100644
--- a/src/auth/session.js
+++ b/src/auth/session.js
@@ -12,7 +12,9 @@ export function readSession(req) {
   const raw = req.cookies.session;
-  const claims = decodeToken(raw);
-  return claims;
+  if (raw === undefined || raw === null) {
+    return null;
+  }
+  return decodeToken(raw);
 }
```

Context for the body: `readSession` previously called `decodeToken` on an
absent cookie, throwing for any unauthenticated request. The fix returns
`null` when the session cookie is missing so callers can branch on a logged-out
visitor instead of catching an exception.

Output only the commit message (subject line, blank line, body). Do not run
`git commit`; just write the message text.

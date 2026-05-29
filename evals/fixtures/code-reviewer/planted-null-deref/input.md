---
agent: code-reviewer
tier: periodic
deps:
  - agents/code-reviewer.md
---

# Synthetic implementer artifact: user-profile renderer

The implementer added a small helper that loads a user record from the cache
and renders the user's email into a profile header. The code below is the
slice's only material change.

```js
// src/user/render-profile.js
import { getUserFromCache } from "../cache/users.js";

export function renderProfileHeader(userId) {
  const user = getUserFromCache(userId);
  // Renders "Signed in as: <email>" into the profile header.
  return `Signed in as: ${user.email}`;
}
```

The implementer notes: "`getUserFromCache` returns the cached record or
`null` if the user has not been seen yet. Calling `renderProfileHeader`
for a fresh visitor reaches this code path."

The slice's tests cover the cache-hit branch only.

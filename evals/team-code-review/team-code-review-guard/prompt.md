---
tags: [readonly, no-agent]
allowed_tools: [Read, Grep, Glob, Skill, TodoWrite]
max_turns: 6
timeout_seconds: 240
---

Review this function for bugs:

```js
function avg(xs) { return xs.reduce((a, b) => a + b) / xs.length; }
```

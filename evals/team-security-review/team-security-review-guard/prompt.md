---
tags: [readonly, no-agent]
allowed_tools: [Read, Grep, Glob, Skill, TodoWrite]
max_turns: 6
timeout_seconds: 240
---

Is this route safe?

```js
app.get("/file", (req, res) => res.sendFile(req.query.path));
```

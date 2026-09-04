### Authorized mode — apply, resolve, resume

When the arming instruction grants authorization, each feedback batch
runs the Authorized Execution path of
`skills/pr-open-comments/SKILL.md`: apply → push → reply → resolve.
Then the loop re-arms until approval, merge, or timeout. Authorized mode
is unchanged by the confidence gate — it applies every non-exclusion
item regardless of confidence.

- If a batch contains exclusion items, apply the authorized items first.
  Then present the exclusions and stop the loop. The exclusions are
  declined, needs-clarification, could-not-apply, and
  security-sensitive. Never watch past an open disagreement.
- Never auto-push a change that introduces a new security-sensitive
  construct (exec/eval-like code, network calls, credential handling) —
  treat it as a loop-stopping exclusion: present it and stop.
- If a push fails in authorized mode, stop the loop and report the
  actual `git push` error output. When the remote diverged, suggest
  `git pull --rebase`. Never reply "done" or resolve a thread without
  landed code.

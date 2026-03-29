# Teamflow Motion & Animation Plan

## Context

The Teamflow dashboard currently renders pipeline state changes (phase
transitions, agent status, new events, errors) without any visual motion. Users
cannot perceive *what just changed* when an SSE update arrives. This plan adds
CSS transitions and Svelte transition directives to communicate state changes
through motion, not decoration. Product-owner decisions are recorded in
`.team/events.jsonl` (seq 4, `ambiguity.resolved`).

## Steps

### Phase 1 -- Motion Tokens (foundation)

**1.1** `[parallel]` **teamflow/src/client/styles/theme.css**
Add motion design tokens to `:root` alongside existing color/spacing tokens:
- `--duration-fast` (150ms), `--duration-normal` (250ms), `--duration-slow` (400ms)
- `--ease-out` (cubic-bezier(0, 0, 0.2, 1)), `--ease-in-out` (cubic-bezier(0.4, 0, 0.2, 1))
- `--ease-spring` (cubic-bezier(0.34, 1.56, 0.64, 1)) for overshoot effects
- Add a `@media (prefers-reduced-motion: reduce)` block that overrides all
  three duration tokens to `0ms`

**Verification:** Inspect `:root` in browser DevTools; toggle
"prefers-reduced-motion" in DevTools rendering settings and confirm durations
become 0ms.

### Phase 2 -- PhaseCards Animation

**2.1** `[parallel]` **teamflow/src/client/components/PhaseCards.svelte** -- Agent icon transitions
- Add CSS `transition` on `.agent-icon` using the motion tokens: transition
  `opacity` and `transform` over `--duration-fast` with `--ease-out`
- When status is `running`, apply a subtle scale-up (e.g., `transform:
  scale(1.15)`) so the icon "pops" into the running state
- When status is `done`, transition back to `scale(1)` with full opacity
- When status is `idle`, keep `opacity: 0.5` (existing pending behavior)

**Verification:** Run `node teamflow/bin/demo.mjs` and observe agent icons
animate when transitioning idle to running to done.

**2.2** `[parallel]` **teamflow/src/client/components/PhaseCards.svelte** -- Active phase pulse
- Add a CSS `@keyframes pulse` animation on `.phase-card.active` that subtly
  pulses the border glow (border-color opacity oscillation) using
  `--duration-slow` as the cycle base
- Use `animation-iteration-count: infinite` while active
- The `prefers-reduced-motion: reduce` media query should set
  `animation: none` on this element

**Verification:** During demo playback, the currently active phase card has a
gentle pulsing border; toggling reduced-motion in DevTools stops it.

**2.3** `[sequential]` **teamflow/src/client/components/PhaseCards.svelte** -- Phase card status transitions
- Add CSS `transition` on `.phase-card` for `border-color`, `opacity`, and
  `border-width` using `--duration-normal` with `--ease-in-out`
- This makes the card smoothly shift from pending (0.5 opacity) to active
  (green border) to completed rather than snapping

**Verification:** Phase cards fade/shift smoothly between pending, active, and
completed states during demo playback.

### Phase 3 -- Timeline Entrance Animation

**3.1** `[sequential]` **teamflow/src/client/components/Timeline.svelte** -- Keyed each blocks
- Add a `key` to the `{#each events as entry}` block using `entry.seq` so
  Svelte can track individual entries: `{#each events as entry (entry.seq)}`

**3.2** `[sequential]` **teamflow/src/client/components/Timeline.svelte** -- Entry entrance animation
- Import `slide` (or `fly`) from `svelte/transition`
- Add an `in:` transition directive on each `.event-entry` div, using `fly`
  with `y: 10` and `duration` read from a constant matching
  `--duration-normal` (250ms)
- The Svelte transition directive respects the browser's reduced-motion
  preference automatically when duration is 0ms, but also add an explicit
  `duration` parameter that checks `window.matchMedia` or simply uses the
  CSS custom property approach

**Verification:** New events slide/fly in from below when they appear during
demo playback. With reduced-motion enabled, they appear instantly.

### Phase 4 -- ErrorPanel Slide-In

**4.1** `[sequential]` **teamflow/src/client/components/ErrorPanel.svelte** -- Mount transition
- Import `slide` from `svelte/transition`
- Add `transition:slide` on the outer `.error-panel` div (the one inside the
  `{#if errors.length > 0}` block), with `duration` matching
  `--duration-normal` (250ms)
- This gives a slide-in effect when the first error appears and a slide-out
  if errors were ever cleared

**Verification:** During demo, trigger a `hard-gate.failed` event (add one
temporarily to demo timeline or modify demo.mjs) and observe the error panel
slides in from collapsed height rather than popping.

### Phase 5 -- Reduced-Motion Audit

**5.1** `[sequential]` **teamflow/src/client/styles/theme.css**
- Verify the `prefers-reduced-motion: reduce` block covers all duration
  tokens added in Phase 1
- No additional work needed if Phase 1 was done correctly, but this is the
  explicit audit step

**5.2** `[parallel]` **teamflow/src/client/components/Timeline.svelte**
- Ensure the Svelte `in:` transition uses a duration that respects
  reduced-motion (either by reading a JS variable derived from the media
  query, or by setting duration to 0 when `matchMedia` matches)

**5.3** `[parallel]` **teamflow/src/client/components/ErrorPanel.svelte**
- Same reduced-motion check for the `transition:slide` duration

**Verification:** Toggle "prefers-reduced-motion: reduce" in DevTools. All CSS
animations stop, all Svelte transitions complete instantly.

## Tests

Since this is a CSS/visual feature in a sidecar dev tool without a component
test harness, verification is done via the demo script. Each test corresponds
to an observable behavior during `node teamflow/bin/demo.mjs`:

| # | Test Name | Verifies | Covers Step |
|---|-----------|----------|-------------|
| T1 | `motion_tokens_present_in_root` | `:root` contains `--duration-fast`, `--duration-normal`, `--duration-slow`, `--ease-out`, `--ease-in-out`, `--ease-spring` | 1.1 |
| T2 | `reduced_motion_zeroes_durations` | Under `prefers-reduced-motion: reduce`, all duration tokens resolve to `0ms` | 1.1, 5.1 |
| T3 | `agent_icon_scales_on_running` | Agent icon visually scales up when status transitions to `running` | 2.1 |
| T4 | `agent_icon_settles_on_done` | Agent icon returns to normal scale when status transitions to `done` | 2.1 |
| T5 | `active_phase_card_pulses` | The active phase card border pulses continuously | 2.2 |
| T6 | `phase_card_transitions_smooth` | Phase card opacity and border animate between states | 2.3 |
| T7 | `timeline_events_keyed_by_seq` | Each block uses `entry.seq` as key (inspect source) | 3.1 |
| T8 | `timeline_entry_flies_in` | New timeline entries animate in from below | 3.2 |
| T9 | `error_panel_slides_in_on_mount` | ErrorPanel slides open when first error appears | 4.1 |
| T10 | `reduced_motion_disables_all_animation` | With reduced-motion preference, no visible animation on any component | 5.1-5.3 |

## Done Criteria

- [ ] All six motion tokens (`--duration-fast`, `--duration-normal`,
      `--duration-slow`, `--ease-out`, `--ease-in-out`, `--ease-spring`) exist
      in `:root` in theme.css
- [ ] `@media (prefers-reduced-motion: reduce)` block sets all duration tokens
      to `0ms`
- [ ] PhaseCards agent icons transition smoothly between idle, running, and done
- [ ] Active phase card has a pulsing border animation
- [ ] Phase card state changes (pending/active/completed) animate smoothly
- [ ] Timeline `{#each}` block is keyed by `entry.seq`
- [ ] New timeline entries animate in with `fly` or `slide` transition
- [ ] ErrorPanel uses Svelte `transition:slide` on mount
- [ ] All animations are disabled under `prefers-reduced-motion: reduce`
- [ ] No new npm dependencies added
- [ ] `node teamflow/bin/demo.mjs` plays through the full pipeline with
      visible motion at each state change
- [ ] Existing dashboard functionality (SSE streaming, theme toggle,
      auto-scroll) is unaffected

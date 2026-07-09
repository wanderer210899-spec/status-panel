<!--
CHANGE REQUEST — add a {{name}} label token that renders a field's NAME, complementing {name}
(its value). Surfaced when the author edited the theme-prompt example to use {{心情}} as a label.
Touches the render/interpolation engine → SPEC amendment S14.
-->

# Change: `{{name}}` field-name label token

- **Date:** 2026-07-08
- **Project:** tavernhelper-dev/status-panel · Feature: template interpolation (S5/S14)
- **Status:** Done (built + verified 2026-07-08, Session 9 — see changelog; SPEC S14)

## What it does now
Panel templates support one token per field: **`{name}` → the field's live value** (empty → dash,
S5). The field's *label* had to be typed as literal text by the author (e.g. `<span>心情</span>`).
Double-brace `{{name}}` was not a feature — and because the value pass splits on `{name}`, a
`{{心情}}` in a template actually came out as `{value}` (the value wrapped in stray braces).

## What should change
Add **`{{name}}` → the field's NAME** as a static label, alongside `{name}` → value. So a row can be
written `{{心情}}：{心情}` and render as `心情：开心`. This makes templates easier to write and lets
the AI Theme Generator emit a label + value straight from the token list.

## Why now
The author, editing the extracted `theme-prompt.md`, changed the example's row labels to `{{心情}}`
expecting them to render as the field name. That's a good idea — but needs real engine support, not
just an example, or panels would show literal/garbled braces.

## Must stay the same (regression guard) — REQUIRED
- **`{name}` value substitution** — unchanged (same dash placeholder for empty, same escaping, same
  `preEscapedLiveValues` / `plainTextPlaceholders` behavior).
- **Reserved markers** `{sp_actions}` / `{sp_badge}` — unchanged (handled outside this function).
- **Existing single-brace templates** render identically — the label pass only consumes `{{name}}`,
  which those templates don't contain.

## Rewrite policy — Additive only
- [x] **Additive only** — add a label pass before the existing value pass in `spInterpolateTemplate`
  (render.js). No existing behavior removed.
- [ ] Refactor allowed
- [ ] Replace

## Design / implementation
- `spInterpolateTemplate` (render.js): **two passes.** Pass 1 (new): for each field,
  `html.split('{{'+name+'}}').join(esc(name))`. Pass 2 (existing): `{name}` → live value. Order
  matters — labels first so `{{name}}` is gone before the value pass runs.
- Label is HTML-escaped (field names are author input). No dash for labels (always present).
- No new field schema — a field's `name` is both key and label (confirmed: schema.js uses only
  `f.name`).

## Accepted consequence
- Reverses the old "`{{name}}` invalid" rule (S4/S10 removed value-bearing default tokens). The
  double-brace form now means **label**, a new distinct meaning — not a re-introduction of the old
  value tokens. Any legacy template that (accidentally) contained `{{fieldname}}` and relied on the
  old `{value}`-in-braces output changes; this is vanishingly rare and accepted.

## Acceptance check
> Done when: a template with `{{心情}}` renders the field name "心情" (escaped, always shown), and
> `{心情}` still renders the live value (or a dash when empty), in both the chat panel and the 样式
> preview. `node build.js` clean; SPEC S14 recorded.

## Assumptions
- **Assumption:** the theme-prompt *prose* teaching the model about `{{name}}` is left to the author
  (they are actively editing `theme-prompt.md`); the engine supports the token regardless of what
  the prompt says. The author can add a one-line rule or rely on the example.

<!--
BUG / IMPROVEMENT — AI Theme Generator (S12). The generation request prompt is too verbose and
sends field examples the designer doesn't need; the in-flight request can't be cancelled.
-->

# Bug: AI Theme Generator prompt too wordy + not cancellable

- **Date:** 2026-07-08
- **Project:** tavernhelper-dev/status-panel · Feature: AI Theme Generator (S12)
- **Where:** `spBuildThemeDesignSystemPrompt` + `runThemeDesignGeneration` (src/api/generate.js);
  generate wiring in `spBindStylesTab` (src/ui/panel.js)
- **Severity:** annoying (degrades output quality + UX), not blocking
- **Status:** Fixed — prompt rewritten to v2 (data slots token+type+range, one rich example,
  self-check) + click-to-cancel added; built + harness-verified 2026-07-08, Session 8. Real-model
  output-quality eval still pending (see plan.md Follow-Up).

## What's wrong
1. **Prompt too wordy / sends field examples.** The design system prompt currently injects the full
   field-rules block (`spBuildFieldConstraintsBlock`) — types, ranges, enum options, example values,
   hints. The theme designer only needs to know **which value tokens exist** to place them; the
   examples/ranges are value-generation concerns and just bloat the prompt.
2. **No cancel.** Once 生成 is clicked, the button shows *⏳ 生成中…* and there's no way to abort an
   in-flight request (e.g. wrong description, slow model).

## Expected
1. A **short, style-focused** prompt that:
   - Tells the model **how to style the SP panel only** (the HTML template contract: self-contained
     `<style>` + markup, wrapped in `.sp-iframe-root`, optional `--sp-*` vars, responsive, no external
     resources except font `@import`).
   - Gives a **simple list of the available tokens** — the JSON key names as `{key}` placeholders,
     plus the required `{sp_actions}` / `{sp_badge}` markers — **with NO examples, ranges, or hints.**
   - Includes **one example output** (one-shot) so the model matches the expected shape.
   - Ends with the "output only HTML, no fences/commentary" rule.
2. **生成中 is click-to-cancel:** clicking the *⏳ 生成中…* button aborts the request (via
   `generation_id` + `TH.stopGenerationById`), re-enables the UI, and discards any late result.

## Actual
1. Prompt includes the verbose per-field constraints block with example values.
2. 生成中 is a disabled/no-op state; the request runs to completion with no abort.

## Token list — clarification (per intake)
The engine's live-value token is single-brace **`{key}`** (e.g. `{心情}`); double-brace `{{name}}`
is not valid here. The list sent to the designer will be the field keys as `{key}` tokens, e.g.
`{心情} {好感度} {新的}` — nothing else.

## Repro
1. Open 样式 tab → 高级 → AI 主题生成. Type a description, click 生成.
2. Inspect the outgoing request (mock API log) → the system prompt carries the full field-rules block
   with examples. There's no way to cancel while 生成中 shows.

## Fix acceptance
> Done when: the mock API log shows a short, style-only design prompt whose token section is just the
> `{key}` list (no examples/ranges) plus a single example template; and clicking 生成中 aborts the
> request, restores the 生成 button, and applies nothing. Verify the model-facing text via the mock
> first, then live end-to-end.

## Assumptions
- **Assumption:** cancel uses a per-request `generation_id` passed to `generateRaw` + a client-side
  stale-token guard so a late reply is ignored even if the server finishes. (`generateRaw` accepts
  `generation_id`; `TH.stopGenerationById` / `stopAllGeneration` confirmed available.)
- **Assumption:** the one-shot example in the prompt is a compact generic panel (title + a couple of
  rows + `{sp_actions}` + `{sp_badge}`), not tied to the current card's specific fields.

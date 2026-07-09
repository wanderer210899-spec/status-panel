<!--
CHANGE REQUEST — extract the AI theme-generation system prompt out of generate.js into a
dedicated, plain-language file the author can read and edit without touching code logic.
Motivated by prompt-quality iteration (latest prompt still underwhelms on a real model).
-->

# Change: Extract the AI theme prompt into an editable file

- **Date:** 2026-07-08
- **Project:** tavernhelper-dev/status-panel · Feature: AI Theme Generator (S12)
- **Status:** Done (built + byte-identity-verified 2026-07-08, Session 9 — see changelog). Prompt
  prose now lives in `src/api/theme-prompt.md`, inlined by build as `SP_THEME_PROMPT_TEMPLATE`.

## What it does now
The system prompt sent to the AI when generating a panel theme is built inside code:
`spBuildThemeDesignSystemPrompt(cfg)` in [generate.js:106](../src/api/generate.js) assembles the
whole prompt — the role line, output rules, the data-slot list, required markers, design guidance,
one example, and the self-check — as one big string literal, buried in a ~5000-line source file.
To tweak the wording you have to find and edit that function.

## What should change
Move the **editable prose** of the prompt into its own clearly-named file
`src/api/theme-prompt.md`, written in plain language (Chinese, as now), so the author can open and
edit just the instructions/wording/example without wading through code. The build step folds that
file's text back into the bundle.

- The file holds the **full prompt text and the example**, exactly as the model sees it, minus the
  one auto-generated part.
- The **data-slot list** (each card field's `{token}` + type + numeric range / enum options) stays
  **auto-generated in code** and is dropped in at a marker `{{DATA_SLOTS}}` in the file. The author
  never hand-maintains the field list — it always matches the current card.
- `spBuildThemeDesignSystemPrompt` becomes tiny: compute the data-slots, load the template text,
  substitute `{{DATA_SLOTS}}`, return.

## Why now
The current v2 prompt still doesn't produce great-looking panels on a real model. Iterating on the
wording is the next lever, and it's painful while the prompt is embedded in code. A dedicated file
makes each tuning pass a one-file edit + rebuild. (Judging the *quality* of a new prompt still needs
a real-model run — the mock returns canned HTML — so quality tuning itself is a separate follow-up;
this change only makes that iteration cheap.)

## Must stay the same (regression guard) — REQUIRED
- **Identical prompt output.** After extraction, the assembled prompt the model receives is
  byte-for-byte what it is today (same text, same data-slot injection, same example, same
  self-check). This is a pure refactor of *where the text lives*, not *what it says*.
- **Data-slot auto-generation** — tokens/types/ranges/enum options still computed from the live card
  fields (numbers show range, enums show options, text shows as text), and the "no fields" fallback
  line still appears when the card has no fields.
- **Cancel, drafts, Keep & Save, live token filling** — all S12/S13 behavior untouched.
- **Build/deploy loop** — `node build.js` still produces `main.js` + `dist/` as before.

## Rewrite policy — Refactor allowed
- [ ] Additive only
- [x] **Refactor allowed** — restructure `spBuildThemeDesignSystemPrompt` and add a small build step
  to inline the file, but the prompt the model sees is preserved exactly (see regression guard).
- [ ] Replace

## Cleanup expectation
- [x] No dead residue: the inline prose that moves into `theme-prompt.md` is removed from
  `generate.js` (not left commented out). The already-unused `tokenChecklist` local (computed but
  never referenced in the returned prompt) is removed while here.

## How editing works (author-facing, state plainly)
- Edit `src/api/theme-prompt.md` → run `node build.js` → refresh the ST tab. Because TavernHelper
  scripts run bundled in a sandboxed iframe, there is **no live file reading at runtime**; the
  rebuild is what applies your edit. (This is why we did NOT put it in a live in-app textbox — the
  author chose the file approach.)
- Keep the `{{DATA_SLOTS}}` marker somewhere in the file; if it's deleted, the field list won't be
  injected. The build should warn (not crash) if the marker is missing.

## Acceptance check
> Done when: `src/api/theme-prompt.md` exists holding the prompt prose + example with a
> `{{DATA_SLOTS}}` marker; `spBuildThemeDesignSystemPrompt` reads that template and injects the
> auto-generated slots; a fresh `node build.js` succeeds; and the prompt captured from the mock API
> for a card with fields is identical to the pre-change prompt (same text, same slot lines).

## Assumptions & open questions
- **Assumption:** the example stays *inside* the file (editable), since the example is a primary
  quality lever. Only the per-card data-slot list is a code-injected placeholder.
- **Assumption:** build injects the file text as a bundle-scope constant
  (`SP_THEME_PROMPT_TEMPLATE`) read by `generate.js`; no SPEC change (S12 unchanged — same prompt,
  new storage location). If desired we can note the file location in SPEC S12 as a pointer.

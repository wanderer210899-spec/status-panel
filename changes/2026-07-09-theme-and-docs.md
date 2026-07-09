# Change Request — Settings-window ST theming + doc refresh

**Date:** 2026-07-09 · **Mode:** Change Request (spec-communication) · **Follows:** `2026-07-09-final-review-qa.md` (this actions its R2 + a docs pass)

## What it does now
- The settings window (`#SP_PANEL_ID`: 字段/生成/样式/管理 tabs) and the ✏ 编辑 pop-up are painted with a **fixed dark palette** (`rgba(22,22,28,.96)` surface, white-on-dark text, `#1b1d27` edit box). They ignore the user's SillyTavern theme. (This was R2 — reported, not fixed, in the final-review session.)
- `AUTHOR.md` / `指南.md` are long tutorials (~600 words) and are **not** true mirrors (指南 carries an extra embedded AI-CSS prompt).
- `styles.md` (panel HTML/CSS reference) is English-only; no Chinese mirror.

## What should change
1. **Settings window → ST theme variables.** Surface `var(--SmartThemeBlurTintColor)`, text `var(--SmartThemeBodyColor)`, borders `var(--SmartThemeBorderColor)`, shadow `var(--SmartThemeShadowColor)`, inputs mirror ST's own (`var(--black30a)` bg + body-color text). Current dark values kept as **fallbacks** so nothing regresses on a theme that omits a var.
2. **✏ 编辑 pop-up → ST theme too** (user decision 2026-07-09, **overrides S6** which had it match the card's `--sp-*` panel theme). Fallback order: ST var → `--sp-*` panel var → current literal.
3. **AUTHOR.md + 指南.md → concise true mirrors**, **< 400 words each (target 200–300)**. Cover: the single **SP 面板** button, the four tabs, the 🔄 重试 / ✏ 编辑 actions, 复制状态块, badges, and a brief **two-mode prompt-injection** section — (a) *appended to the prompt* (always-on instruction, Path A) and (b) *retry only* (on-demand generateRaw, Path B). Point to `styles.md` / `styles-prompt.md` for styling detail instead of inlining it.
4. **New `样式.md`** — Simplified-Chinese mirror of `styles.md` (selectors, tokens, `--sp-*` vars). Same structure; class names / code / tokens kept byte-identical, only prose translated.

## Must stay the same
- Panel iframe rendering, `--sp-*` panel theming, tokens, the scoper — untouched.
- `styles-prompt.md` — **unchanged** (explicitly out of scope).
- No behavior change to generation, storage, or the card whitelist. CSS + docs only.

## Rewrite policy
Refactor allowed within the two CSS `<style>` blocks in `src/ui/styles.js` and a full rewrite of the four doc files above. No JS logic changes.

## Acceptance check
- Settings window + 编辑 pop-up visibly adopt the active ST theme (verified in-harness), and still legible with the shipped dark theme via fallbacks.
- `AUTHOR.md` and `指南.md` are mirrors, each < 400 words, and describe the two injection modes.
- `样式.md` exists and mirrors `styles.md`; cross-links resolve (指南→样式, AUTHOR→styles).
- Bundle rebuilds, `node --check` clean.

## Assumptions
- Chinese styles mirror named **`样式.md`** (matches the `AUTHOR.md`↔`指南.md` naming convention).
- Docs drop the styling walkthrough/embedded prompt and link out, to hit the word budget.

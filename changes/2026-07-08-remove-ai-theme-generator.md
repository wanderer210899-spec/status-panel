# Change: remove the in-app AI Theme Generator (S12/S13 design path)

- **Date:** 2026-07-08
- **Project:** status-panel
- **Status:** Building

## What it does now
The 样式 → 高级 tab has an **✨ AI 主题生成** panel: the author types a look ("dark sci-fi HUD"),
clicks 生成, and the in-chat AI writes the panel's HTML/CSS inline (S12), with multi-turn tweaks,
cancel, and in-memory drafts (S13). It is a second `generateRaw` site (design, not values).

## What should change
Remove that in-app generator entirely. Getting a good panel out of it was consistently hard
(the small in-chat model produces flat/token-dropping output — flagged repeatedly in plan.md).

## Why now
User: "incredibly difficult to get a good status panel generated inline." Confirmed direction:
**remove it, keep the rest.**

## Must stay the same (regression guard)
- **简易 mode** (deterministic slider/color layout generator) — untouched.
- **高级 mode** manual HTML/CSS paste + import + preview + save — untouched.
- The **external-model prompt** path (copy 复制状态块 → run in Claude/ChatGPT → paste into 高级) —
  this is now the recommended styling route; documented in `AUTHOR.md`/`指南.md`/`styles.md`.
- **Value generation** (`runStatusGeneration`, 🔄 重试) and all shared plumbing it uses:
  `_spGenChain`, `spResetGenChain`, `spExtractGenerateText`, `custom_api` construction,
  `generateRaw`. These are shared — delete only the design-path code, never this.
- `designMode` config key ('simple'/'advanced'), theme knobs, persistence — untouched.

## Rewrite policy
**Replace/remove.** Delete the design-generation code; do not refactor the value path.

## Cleanup expectation
No residue. Remove: `runThemeDesignGeneration`, `spBuildThemeDesignSystemPrompt`,
`spStopThemeDesignGeneration`, `spStripCodeFences` (generate.js); the `#sp-ai-design*` markup and
all its wiring incl. `spThemeDesignDrafts` / `aiActive` / `aiReqSeq` / `aiGenId` and the
generate/keep/discard/cancel handlers (panel.js); `buildThemePromptConst` + `SP_THEME_PROMPT_TEMPLATE`
(build.js); and delete `src/api/theme-prompt.md`. Verify with grep post-build.

## Acceptance check
- Build is clean (`node build.js`, `node --check`); no `sp-ai-design` / `ThemeDesign` /
  `SP_THEME_PROMPT_TEMPLATE` tokens remain in source or bundle.
- 样式 tab still opens; 简易 and 高级 (manual paste) both save and render a panel.
- 🔄 重试 value generation still works.

## Notes
SPEC S12 is retired; S13's design-gen/cancel clauses are retired but its tag-override removal and
UI simplification stand. Historical intake (`changes/2026-07-08-ai-theme-generator.md`,
`changes/2026-07-08-extract-theme-prompt.md`, `bugs/2026-07-08-ai-theme-generator-prompt.md`) is
left as audit trail.

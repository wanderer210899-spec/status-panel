# Implementation Plan — status-panel

## Current Session — 2026-07-09 / Session 4 (save workflow — Pass 2 of change request)

Change request `changes/2026-07-09-mobile-css-and-save-workflow.md`, **Pass 2 (F1/F2)**. Rewrite
policy: refactor allowed. All in `src/ui/panel.js` (+ header CSS in `styles.js`).

- [Completed] **F1 — no data lost between tabs (or close/reopen).** Added a settings-window draft
  model (`spPanelDraft` + `spCurrentTabEdited`, `SP_DRAFT_KEYS`). `renderPanelContent` seeds inputs
  from `spDraftedConfig()` (saved config + draft overlay); the tab-switch handler and `closePanel`
  call `spBeforeRerender()` → `spCaptureCurrentTabDraft()` before the DOM is replaced. Cleared only
  by a new top-right **清除更改** button (`spDiscardDraft`), a successful save (per-tab
  `spClearSavedTabDraft`), or reload (draft is module-scope in-memory).
- [Completed] **F2 — smart Save.** Delegated `input`/`change` listener on the panel body sets the
  dirty flag; header shows a **● 未保存** cue + the 清除更改 button whenever unsaved edits exist
  (`spUpdateDirtyCue`, readonly previews excluded). On first setup (simple mode, empty template)
  the fields-save seeds a default layout + default-colour theme (`spGenerateLayoutHtml` +
  `spLayoutTheme`) so the panel renders correctly immediately.
- [Completed] Dedup: `collectTheme` now delegates to the shared `spCaptureThemeFromDom`; removed the
  now-unused `COLOR_KEY` map inside `spBindStylesTab`. Rebuilt **5130 lines**, `node --check` clean.
- [Completed] Harness verify (chrome-devtools MCP, localhost:8000, reloaded). 深度=7 + instruction
  survived 生成→字段→生成 **and** close/reopen; cue+Clear appear on edit, hidden when clean; 清除更改
  reverted 深度 7→0 and the instruction to saved text; clean tab visit raised no false cue; accent
  `#123456` (+ hex) persisted 样式→管理→样式. No Save clicked → character card untouched; panel
  closed clean. (F2 default-layout path guarded to empty-template first setup; not exercised on the
  harness character, which already has a template.)

## Previous — 2026-07-09 / Session 3 (mobile/CSS bug pass — Pass 1 of change request)

Change request `changes/2026-07-09-mobile-css-and-save-workflow.md`, **Pass 1 (visual bugs)**.
Rewrite policy: refactor allowed. F1/F2 (tab persistence + smart Save) done in Pass 2 (above).

- [Completed] **B1 — mobile colour picker.** Every colour well now has a paired hex text field
  (`.sp-color-hex`, `spThemeColorField` + the bare 主色 input; sync + override/regen wiring in
  `spBindStylesTab`). Native picker degrades to swatches on mobile → authors type/paste hex instead.
- [Completed] **B2 — 生成 tab alignment.** `.sp-row label` = inline-flex; in-row `select`/number
  inputs forced `width:auto` so the 角色 `<select>` stops inheriting the global `width:100%` that
  broke the row. 深度 + 角色 now share one centred row.
- [Completed] **B3 — ≥0.8 opacity floor, both surfaces.** Settings window `#SP_PANEL_ID` background
  composites `--SmartThemeBlurTintColor` over itself (colour + 4 gradient layers = 5 stacks; fallback
  layers are transparent so the shipped dark look is unchanged). In-chat `.spg-card` bg `.42`→`.88`.
- [Completed] **B4 — 按钮折叠 checkbox.** Added a check/radio reset inside `#SP_PANEL_ID`
  (`width:auto;margin:0;flex:0 0 auto`) so ST's leaked input styling stops displacing them; the
  inline-flex label keeps the box beside its caption.
- [Completed] Rebuilt **4986 lines**, `node --check` clean. `styles.md` + `样式.md` `.spg-card` row
  updated (`.42`→`.88`).
- [Completed] Harness verify (chrome-devtools MCP, localhost:8000, reloaded build). Settings-window
  bg = `rgba(29,33,40,0.9)` composited to 5 stacks (effectively opaque). 生成 tab: 深度/角色 same
  row, 角色 select 77px (content-sized), centres aligned. 样式 tab: 7 hex fields uniform 88px;
  hex→swatch (`#ff0066` set 标题色 + overridden=1) and swatch→hex (`#00ffaa`) both sync; 按钮折叠
  checkbox 12px/margin 0 at label left edge. Narrow viewport: panel within bounds, **0 internal +
  0 document x-overflow**. Panel closed, no stray modals.

## Follow-Up

- [ ] (Optional) On later fields edits in simple mode, regenerate the layout so newly-added fields
  appear without a trip to 样式 (today only the first setup auto-seeds; pre-existing behaviour).

## Older — 2026-07-09 / Session 2 (settings-window ST theming + doc refresh)

Change request `changes/2026-07-09-theme-and-docs.md` (actions R2 from the final-review pass + a
docs refresh). Rewrite policy: refactor allowed within the two `<style>` blocks in `styles.js` +
full rewrite of the four docs; no JS logic changes. `styles-prompt.md` explicitly untouched.

- [Completed] **R2 — settings window → ST theme.** `#SP_PANEL_ID` chrome (surface / text / borders /
  shadow / inputs / font) now reads `--SmartThemeBlurTintColor` / `BodyColor` / `BorderColor` /
  `ShadowColor` / `--black30a` / `--mainFontFamily`, each with the prior dark literal as fallback.
  Subtle white highlight overlays + semantic warning/danger colors left literal.
- [Completed] **✏ 编辑 pop-up → ST theme too** (user decision — **overrides S6**). `.sp-edit-modal`
  box/inputs/title/save-accent use `--SmartTheme*` first, then `--sp-*` panel var, then literal.
- [Completed] Rebuilt **4927 lines**, `node --check` clean.
- [Completed] `AUTHOR.md` + `指南.md` rewritten as concise true mirrors (~300 words each, <400):
  SP 面板 button, four tabs, 🔄/✏ actions, 复制状态块, badges, and the **two-mode injection** section
  (appended-to-prompt / retry-only). Styling walkthrough + embedded AI prompt dropped → link to
  `styles.md` / `styles-prompt.md`. `指南.md` no longer carries the divergent §3.
- [Completed] New `样式.md` — Simplified-Chinese mirror of `styles.md` (selectors/tokens/`--sp-*`
  identical, prose translated); cross-links wired (指南→样式, styles↔样式).
- [Completed] `agent.md` updated (edit-modal row = S6 amended; usually-ignore note = ST-themed
  chrome; docs line = EN/中 mirror pairs).
- [Completed] Harness verify (chrome-devtools MCP, localhost:8000, reloaded build). Settings window
  computed styles = ST theme: bg `rgba(23,30,33,0.61)` (`--SmartThemeBlurTintColor`), text
  `rgb(171,198,223)` (`--SmartThemeBodyColor`), border `rgba(0,0,0,0.5)`, font Noto Sans, shadow
  from shadow var; header/inputs `--black30a` + body-color text; tab-active highlight stays literal.
  ✏ 编辑 box probed identically (blur-tint bg, body text, shadow var, `--black30a` inputs, save-btn
  accent `rgb(111,133,253)`). Theme holds at 390px width, no x-overflow. Panel closed, harness clean.

## Previous — 2026-07-09 / Session 1 (final review & QA pass) — DONE

Change request `changes/2026-07-09-final-review-qa.md` (Done). Policy: fix safe, report risky.

- [Completed] Phase 1 review + safe fixes: removed ~90 lines dead CSS (`.sp-prev-*`,
  `.sp-badge-*` preview, `.sp-preset-*`, `.sp-prompt-preview`, `.sp-preset-line`); toolbar cut to
  **SP 面板 only** (removed SP 清除 binding + loader SP 清除/SP 刷新); agent.md doc drift fixed
  (SPEC S1–S14, `{{name}}` S14 label token). Rebuilt 5031→4926, `node --check` clean.
- [Completed] Phase 2 test plan (D1–D17 + M1–M3) written into the change file.
- [Completed] Phase 3 browser verify (chrome-devtools MCP + st-mock-api, desktop + mobile): all
  passed incl. S11-removal regression (no generator), retry success/error paths, card whitelist
  (no API keys leak), reload persistence, mobile edit-modal fit. Harness state reset after.
- **Open for user decision (reported, not fixed):**
  - **R1** token-in-HTML-attribute corrupts empty value (author 高级 CSS; guardrail already in
    `styles.md §9` — proposed no code change).
  - **R2** settings-window chrome uses a fixed dark palette, not the ST theme vars — deliberate
    long-standing look; change only if you want ST-theme inheritance (separate task).

## Previous — 2026-07-08 / Session 12 (move AI-write-CSS prompt into styles.md; probe output)

Change request `changes/2026-07-08-move-theme-prompt-to-styles.md`. User: make styles.md the single
authoritative theme guide, and probe (chrome-devtools MCP) why a model's output "isn't working" +
what's unnecessary in styles.md. Scoping via AskUserQuestion: **move first**, **report findings**
(no prompt rewrite yet), **remove AUTHOR.md §3 entirely**.

- [Completed] Moved the "Let AI write the CSS" prompt (intro + note + full fenced prompt) from
  `AUTHOR.md §3` into `styles.md` as new **§9**. Only edit to the prompt body: the self-reference
  "authoritative selector list is styles.md" → "the tables above (§4, §7)". Removed AUTHOR.md §3
  entirely (user choice; §2 already links styles.md). No duplication across the two files.
- [Completed] **Live probe** (isolated Chrome on :9222 → localhost:8000, chrome-devtools MCP):
  read the live `#sp-frame` srcdoc (real engine assembly); confirmed harness card fields ARE
  时间/地点/心情/好感度/着装/内心想法 (match the model tokens); rendered the model's exact `fs-*`
  output through a faithful copy of the engine pipeline in two states and screenshotted.
- [Findings — reported to user, NOT yet acted on]:
  1. **Real bug**: value token inside an HTML attribute — `style="width:{好感度}%"` — expands to
     `style="width:<span class="sp-ph...">—</span>%"` when 好感度 is empty; the inner quote
     terminates the attribute, so the bar renders full-width + leaks stray text. Confirmed visually.
  2. Model output is otherwise **valid & renders well when data is present** (custom `.fs-*` classes
     scope fine). "Selector naming tables not working" is a misread — §4a `.spg-*` scaffold is not
     used/needed by the AI route (custom classes allowed in 高级); the tables aren't broken.
  3. Empty-state UX: all-empty card → dashes everywhere reads as "broken." Field-key mismatch (if a
     user's real card keys differ from the tokens) leaves tokens literal — the other likely "not
     working" cause.
  4. **Unnecessary-info candidates in styles.md for the AI guide**: §4a `.spg-*` scaffold, §6 badge
     table (player-facing), Source map (maintainer-only), and §1's deep assembly detail.
- [Completed] Baked MUST/NEVER correctness rules into the §9 prompt (user chose: keep §9 as a
  self-contained block + add the rules). New rule verified against `render.js:456-467`
  (`plainTextPlaceholders:true` for `<style>` bodies): **NEVER put a value token in an HTML
  attribute** (empty → span injected → attribute corrupted); drive a bar width from the `<style>`
  block instead (`.fill{width:{key}%}` → empty `width:—%` ignored → 0-width). Plus MUST set a
  background, byte-exact keys, no 100vw/vh.
- Note: an editor re-save (user's open buffer) reformatted styles.md tables AND dropped the §9 I'd
  first added; re-added §9 to the reformatted file with the rules included. If the buffer re-saves
  again it may clobber — flagged to user.
- **Open (user decision):** whether to trim the "unnecessary-info" sections (§4a `.spg-*`, §6 badge
  table, Source map) for the AI-serving goal. 指南.md still has the parallel §3 — not touched this
  session (flagged).

## Previous — 2026-07-08 / Session 11 (remove in-app AI Theme Generator — S12/S13 retired)

User: getting a good panel out of the in-app AI Theme Generator was "incredibly difficult."
Confirmed direction (AskUserQuestion): remove it, keep the rest. Change request
`changes/2026-07-08-remove-ai-theme-generator.md`.

- [Completed] Deleted the design `generateRaw` path from `src/api/generate.js`
  (`runThemeDesignGeneration`, `spBuildThemeDesignSystemPrompt`, `spStopThemeDesignGeneration`,
  `spStripCodeFences`). Kept the shared value-gen infra (`_spGenChain`, `spResetGenChain`,
  `spExtractGenerateText`, `custom_api`, `runStatusGeneration`) — verified `spExtractGenerateText`
  is shared (kept) and `spStripCodeFences` is design-only (deleted).
- [Completed] Removed the `#sp-ai-design*` markup from `spRenderStylesTab` and all wiring from
  `spBindStylesTab` (`spThemeDesignDrafts` L12, `aiActive`/`aiReqSeq`/`aiGenId`, generate/keep/
  discard/cancel handlers + their helpers) in `src/ui/panel.js`. 简易 + 高级 (manual paste/import/
  preview/save) and the `designMode` key are untouched.
- [Completed] `build.js`: removed `buildThemePromptConst` + the `SP_THEME_PROMPT_TEMPLATE` inlining;
  deleted `src/api/theme-prompt.md`.
- [Completed] Rebuilt: **5031 lines** (was 5346 — ~315 removed), `node --check` clean on
  `main.js` + `dist/status-panel.js`, `dist/status-panel.json` parses. **Residue grep clean**: no
  `sp-ai-design`/`ThemeDesign`/`SP_THEME_PROMPT_TEMPLATE`/etc. in any source, `main.js`, or `dist/*`
  (remaining hits are docs + historical intake only).
- [Completed] Docs: SPEC amendment "S12 RETIRED" (+ S12 header marker; S13 tag-removal still stands);
  `agent.md` — dropped the two theme-gen File:Line Index rows, the "AI Theme Generator UI" row, the
  Task Router entry, and corrected the "two generateRaw sites" rule to "the only generateRaw site."
- **Not done:** no live harness/MCP check this session — verified at source/build/grep level only
  (clean build, no residue, value-gen path untouched). A follow-up should load the harness and
  confirm the 样式 tab opens without the generator, 简易+高级 save/render, and 🔄 重试 still works.

## Previous — 2026-07-08 / Session 10 (styles.md styling reference; guides → tutorial-only)

User: a separate `styles.md` documenting **all** HTML/CSS selectors for the sp panel; keep
`AUTHOR.md` + `指南.md` tutorial-only. Docs-only, no code/build.

- [Completed] New `styles.md` — canonical panel-iframe contract: every selector in
  `SP_IFRAME_GLOBAL_CSS` (grouped root / 简易 `.spg-*` / actions+fold / badge / placeholder /
  busy), all ten `--sp-*` variables with defaults, tokens (`{name}` value · `{{name}}` label ·
  `{sp_actions}` · `{sp_badge}`), empty-value dash markup, `{sp_actions}` HTML +
  `data-sp-action`/`data-sp-label` + bridge behavior, badge sources, `spScopeAuthorCss` scoping
  rules (`.sp-iframe-root` prefix, `:root`/`html`/`body` mapping, `:host`, legacy `.sp-block-*`,
  `@import` hoist, passthrough vs nested at-rules), base reset. Verified verbatim against
  styles.js / render.js / layoutgen.js / constants.js (not memory or the old doc tables).
- [Completed] Trimmed `AUTHOR.md` + `指南.md` to tutorial-first: styles.md pointer under "Style
  it"; replaced the standalone button/badge reference CSS block with a one-line link; noted the
  section-3 AI prompt keeps its own embedded quick-reference (must stay standalone for external
  models). Walkthrough + one worked example retained in both languages.
- Drift surfaced (not silently fixed): `agent.md` Task Router L83 ("`{{name}}` removed — flagged
  as unknown") and the AI-prompt's "no `{{double}}` braces" line **predate S14** and are stale —
  code (`spInterpolateTemplate`) treats `{{name}}` as the field-name label. styles.md documents
  the current behavior; the prompt was left as-is (functioning tool) pending a user call.

## Previous — 2026-07-08 / Session 9 (extract AI theme prompt into an editable file)

Change request `changes/2026-07-08-extract-theme-prompt.md` — relocate the theme prompt to an
author-editable file. Refactor-only; prompt text preserved exactly (S12 unchanged).

- [Completed] New `src/api/theme-prompt.md` holds the full prompt prose + example with a
  `{{DATA_SLOTS}}` marker; `build.js` inlines it as `SP_THEME_PROMPT_TEMPLATE` (warns if marker
  missing); `spBuildThemeDesignSystemPrompt` shrank to slots-compute + `split/join`. Dead
  `tokenChecklist` removed.
- [Completed] Verified byte-identical: reconstructed OLD array assembly vs NEW file+substitution →
  identical, 2175 chars; build clean (5346 lines); const at bundle L14 before use at L3199.
- Editing loop: edit `theme-prompt.md` → `node build.js` → refresh tab (no live file read; keep
  `{{DATA_SLOTS}}`).
- [Completed] **S14 `{{name}}` label token** (render.js `spInterpolateTemplate`): renders a field's
  name as a static label, complementary to `{name}` (value). Two-pass (labels then values); escaped;
  10/10 unit tests. SPEC S14; change `changes/2026-07-08-field-name-label-token.md`.
- [Completed] Author-facing token/selector reference extracted to `styles.md` (Session 10),
  which documents S14 `{{name}}` label vs `{name}` value; guides now link to it.

## Previous — 2026-07-08 / Session 7 (AI Theme Generator — S12)

Change request `changes/2026-07-08-ai-theme-generator.md` — one-click AI-generated custom
panel HTML in the 样式 tab. Additive; SPEC amended with S12.

- [Completed] SPEC S12 amendment (design-generation `generateRaw` path, distinct from values).
- [Completed] `runThemeDesignGeneration` + `spBuildThemeDesignSystemPrompt` + `spStripCodeFences`
  in `src/api/generate.js` (freeform HTML reply, shares retry serializer + custom_api).
- [Completed] Generator UI in `spRenderStylesTab` (高级 section) + wiring in `spBindStylesTab`;
  in-memory per-avatar draft Map `spThemeDesignDrafts` (survive-close, Keep/Discard) — `src/ui/panel.js`.
- [Completed] Built + `node --check` clean; full chrome-devtools MCP harness verification
  (generate → preview/textarea, Keep&Save persist, fields unchanged, chat value-filling
  intact, missing-token warn, survive-close, Discard revert). Harness left clean.

## Previous — 2026-07-08 / Session 8 (simplify UI + prompt v2 + cancel — S13)
- [Completed] SPEC S13 (tag-override removal) + prompt v2 / cancel notes on S12.
- [Completed] Removed 实时值 insert-helper (UI + dead fns/CSS); `{key}` tokens intact.
- [Completed] Full purge 状态块标记 `tagStart`/`tagEnd` (store/parser/panel/generate/render); no residue.
- [Completed] Prompt v2 (`spBuildThemeDesignSystemPrompt`): data slots w/ type+range, one rich
  example (bar/pill), self-check. Cancel: `generation_id` + `spStopThemeDesignGeneration` +
  `aiReqSeq` stale-guard; 生成中 toggles to cancel.
- [Completed] Built + live-verified on the docker-fake-api (mock) profile: removals gone, v2 prompt
  captured from mock log, generation + cancel work. Intake files marked Done.

## Follow-Up
- [ ] **Evaluate prompt v2 output quality on a REAL provider** (mock can't judge design quality).
  If a small model still drops tokens or looks flat, next levers: stronger self-check wording,
  mandate the scaffold, or a second contrasting example.
- [ ] Optional: a "从当前样式载入" convenience button was declined (manual copy-paste chosen);
  revisit only if the author asks.

## Previous — 2026-07-07 / Session 6 (docs rewrite → image-led wiki guides)

Docs-only. User: rewrite `AUTHOR.md` + `指南.md` as GitHub-wiki-style guides — trim
trivia, ~300 words of prose (excludes code/definitions/AI-prompt), more images, teach
usage then focus on HTML/CSS styling, include a paste-ready AI prompt. Both languages
carry identical content (AI prompt may stay English). Git scoped to `status-panel` only.

- [Completed] `git init` in `status-panel` (default branch `main`); initial commit is the
  pre-rewrite snapshot (images left untracked). Work branch: `docs/status-panel-guides`.
- [Completed] Rewrote both docs to the same 4-part shape: (1) set up via SP 面板 tabs,
  (2) style — 简易 vs 高级 + tokens table + example HTML + button/badge CSS, (3) paste-ready
  AI prompt (kept verbatim, English, with the full STYLE REFERENCE table), (4) badges +
  "no panel?" note. English prose measured ≈300 words (code/tables/images excluded);
  Chinese mirrors it section-for-section.
- [Completed] Captured 6 real harness screenshots into `images/` (panel-in-chat,
  settings-fields, settings-generate, settings-manage, style-simple, style-advanced) via
  chrome-devtools MCP; docs reference them by relative path. User will hand-add/replace
  pictures as desired — links resolve now so nothing is broken.
- [Completed] README Docs list updated to describe the new guide format.
- [ ] Commit on the branch (docs + images + README + state files). No remote configured —
  user to add origin / open PR when ready.

## 2026-07-07 / Session 5 (Firefox mobile: panel/preview never render)

User report: on mobile Firefox the panel shell appears but content never renders; the
样式 preview is empty. Desktop Chrome fine.

- [Completed] Fix: `spMountIframe` (helpers.js) and the MESSAGE_UPDATED handler
  (index.js) deferred work via `requestAnimationFrame` of the **TH script iframe's own
  window** — that iframe is `display:none`, and Firefox never fires rAF in non-rendered
  documents (Chrome does), so `iframe.srcdoc` was never assigned. Added `spDeferFrames`
  (helpers.js L54): visible top window's rAF + 200ms setTimeout safety net (run-once
  guard; net also covers backgrounded-tab throttling); both call sites switched.
- [Completed] Root cause proven live in Chrome (chrome-devtools MCP, mobile viewport +
  FF-Android UA): stubbing the TH iframe's rAF and calling `refresh()` reproduced the
  exact symptom (panel iframe remounts, srcdocLen 0). After the fix, the same dead-rAF
  simulation renders fully: chat panel srcdoc 10769 / h 519; 样式-tab preview srcdoc
  10651 — both mount via the top-window path.
- [Completed] Rebuild: `node build.js` (5112 lines), `node --check` clean on
  main.js + dist/status-panel.js. Harness page reloaded clean afterwards.
- [ ] User to confirm on real mobile Firefox (via Tailscale) — simulation matched the
  reported symptom exactly, but no real Gecko run was performed.

## 2026-07-07 / Session 4 (remove floating SP FAB)

Code change (S10 amended — see `SPEC.md`). User asked to remove the floating SP button
from the interface completely.

- [Completed] Deleted `ensureToolbarFab` + its drag logic + `spFabDragBound` from
  `src/ui/toolbar.js`; removed the call site in `src/index.js`; removed the `#${SP_FAB_ID}`
  CSS block from `src/ui/styles.js`. `SP_FAB_ID` (constants.js) and its entry in the
  `helpers.js` dispose-cleanup array are kept intentionally — the FAB button is appended to
  the **top document** (`chatDoc()`), and the dev "SP 重载" reload only reloads the TH
  script iframe, not the top page, so a FAB left over from a previously-loaded build would
  otherwise survive a reload; dispose() still sweeps it by id.
- [Completed] Updated the settings-ready toast (`src/index.js`) to point at TavernHelper's
  own **SP 面板** toolbar button instead of the removed FAB/⚙ (the ⚙ mention was already
  stale — S10 removed it from `{sp_actions}` back in the 2026-07-06 pass).
- [Completed] Docs: `SPEC.md` S10 amended with a dated note; `agent.md` File:Line Index row
  updated (`ensureToolbarFab` → `spBindScriptToolbarButtons`); `AUTHOR.md`, `指南.md`,
  `architecture.md` FAB mentions updated to reflect settings opening only via SP 面板.
- [Completed] Rebuilt: 5090 lines (down from 5167 — FAB code removed), `node build.js` +
  `node --check main.js`/`dist/status-panel.js` clean, `dist/status-panel.json` parses.
  Confirmed via grep: no `ensureToolbarFab`/`spFabDragBound` remain in source or bundle;
  `SP_FAB_ID` appears only at its declaration and the dispose-cleanup array.
- **Not done**: no live browser/MCP check — no browser/Playwright MCP tool was connected
  this session, so the removal is verified at the source/build level only (syntax-checked,
  no leftover references), not confirmed by loading the harness in a browser. Docker harness
  (`st-dev`, `st-mock-api`) is up and the bind-mount deploy path applies (rebuild is deploy,
  no sync step needed) — a follow-up session should reload the script in ST and confirm the
  FAB is gone and **SP 面板** still opens settings.

## 2026-07-07 / Session 3 (prompt rebuild — flat style table)

Docs-only pass, no code touched. Follow-up to Session 2 per user direction (answered via
questionnaire): keep `sp.panel` docs-only (no new engine CSS variable — `.sp-iframe-root`
stays the real target, `sp.panel` is just the human label used in the table), scope the
"style everything" table to what a from-scratch 高级 template actually touches (skip the
简易-generator's `.spg-*` classes), and keep `AUTHOR.md`/`指南.md` in sync.

- [Completed] Rewrote the `AUTHOR.md` prompt fence: removed all rationale/logic prose from
  inside the prompt (kept only outside it, for the human reader); collapsed the old
  multi-paragraph numbered "HARD RULES" + two separate tables (CSS vars / already-styled
  classes) into one flat "STYLE REFERENCE" table (target → CSS properties to set, no
  sentences) plus a short bullet list of mechanical STRUCTURE rules (tokens, reserved
  tokens, scoping, width, `@import` order). Added `sp.panel` as the table's first row —
  documents `.sp-iframe-root` (writable as `body`/`:root`/`.sp-iframe-root` since the
  engine's selector scoper already maps all three to the same node) as the target with no
  default background.
- [Completed] Added hover-state row (`.sp-btn-retry:hover`/`.sp-btn-edit:hover`) and a
  per-field-value row to the table — closes the "style literally everything" gap the prior
  version left (it only covered actions/badge/placeholder, not field-value typography).
- [Completed] Rebuilt `指南.md`'s three separate tables (tokens / vars / classes) into one
  merged 完整样式对照表 mirroring the same rows, keeping `指南.md` in sync per the user's
  answer.

## 2026-07-07 / Session 2 (AI-prompt fix + 指南.md)

Docs-only pass, no code touched. Follow-up to Session 1: user reported the Session-1 prompt,
run against Opus 4.8 (medium effort), produced CSS that never set a `background` anywhere —
themed text floated directly on the chat bubble.

- [Completed] Root-caused the omission: `.sp-iframe-root` (base CSS, `spIframeBaseCss` in
  `src/ui/styles.js`) defaults to a transparent background + dark `#2c3e50` text; there is
  no `--sp-bg`-style variable and nothing else paints a surface, so a model given only
  "you may reference these vars" never learns it must supply its own `background` on every
  container it invents.
  Verify: `spIframeBaseCss()` (styles.js ~L456) vs. `--sp-*` var list in
  `spBuildThemeVarBlock` (render.js L518) — none of the vars are a background color.
- [Completed] Rewrote the `AUTHOR.md` prompt: added a hard rule (6) explaining the
  transparent-root default and requiring an explicit `background`+`color` pair on every
  author-created container; expanded the CSS-variable rule into a full table (var / controls
  / default) and added a second table of already-styled classes (`.sp-btn-retry`,
  `.sp-btn-edit`, `.sp-badge`, `.sp-badge-error`, `.sp-ph`/`.sp-ph-dash`, `.sp-busy`,
  `:disabled` state) so the model knows what it can reuse vs. must invent.
- [Completed] New `指南.md` — short Chinese tutorial (the primary audience for this
  product) covering: 3-step field definition for authors, both style modes with the same
  var/class reference tables in Chinese, the AI-prompt shortcut, and a player-facing section
  (consent banner, badge meanings, 🔄 重试/✏ 编辑, why a panel might not appear).
- [Completed] Linked `指南.md` from `README.md`'s Docs list.

## 2026-07-07 / Session 1 (AI-prompt authoring doc)

Docs-only pass, no code touched.

- [Completed] Added an "AI prompt" section to `AUTHOR.md` (after "Porting an existing HTML
  panel"): a ready-to-paste prompt that takes a `复制状态块` JSON export + a per-field
  display note + a style brief, and gets a general-purpose model (Claude/ChatGPT/etc.) to
  produce a complete 高级模式 HTML+CSS block. Pins down: exact `{key}` token matching
  (byte-for-byte against the JSON keys, no `{{double}}` braces), the two reserved tokens
  (`{sp_actions}` → `.sp-actions-wrap`/`.sp-btn-retry`/`.sp-btn-edit`, `{sp_badge}` →
  `.sp-badge`) as real styleable classes, automatic `.sp-iframe-root` scoping (author must
  NOT self-prefix), ≤380px layout constraint, `@import` must lead the stylesheet, and the
  optional `--sp-*` var list for visual consistency with the global chrome.
- [Completed] Called out why the JSON alone under-specifies rendering (no min/max/type),
  and added a per-field display-note placeholder to the prompt to cover that gap.
- Note: superseded/expanded by Session 2 above (the background-color omission fix) the
  same day.

## 2026-07-06 / Session 3 (tooltip / guidance copy pass)

Copy-only pass: no settings-panel tooltip or guidance line longer than one sentence. No code logic touched.

- [Completed] Shortened every multi-sentence help/tooltip string across 生成 / 字段 / 样式 / 管理 tabs (panel.js), the 清除 modal + edit-modal subs, and the render.js guidance card. 主题说明 keeps the 跟随主色 mechanic as a one-sentence parenthetical (user question ⑬); 注入预览提示 kept as a single sentence rather than deleted (user question ⑥).
- [Completed] Preserved `${esc(chName)}` interpolations in 管理-tab 状态语 (no name dropped — that would be a code change); left `parser.js:172` (AI-facing prompt text) alone.
- [Completed] Rebuilt: 5167 lines (unchanged count = text-only edits), build.js clean.

## 2026-07-06 / Session 2 (v3 polish — user feedback)

Feedback pass on the v3 build. Two SPEC amendments (S4, S8) confirmed by the user via questionnaire.

- [Completed] CSS: numeric inputs were unstyled — the panel input rule omitted `input[type="number"]`, so 示例值/min/max/深度 fell back to browser default (white box, native spinners, overflow). Added `number` to the selector (both the base rule and the responsive one).
- [Completed] CSS: edit modal (✏) — **not visible at all** (was centred off-screen). Root cause found live via chrome-devtools: ST puts a `transform`+`perspective` on `<html>`, making it the containing block for our `position:fixed` overlay; that box is height-collapsed, so `inset:0` gave the overlay ~0 height (32px) and the 423px box centred at `top:-196` (mostly above the viewport). Fixed by sizing the overlay with `height:100vh` (viewport-relative, transform-proof) instead of `inset:0`/`bottom:0`. Also added `.sp-em-fields{min-height:0}` (internal scroll) and rewired the modal to the card's `--sp-*` theme vars (inline on the overlay in `spShowEditModal`) so it matches the active panel (S6). **Verified in live harness**: overlay = full viewport, box fully on-screen at top:29, inputs dark (`rgba(0,0,0,.32)`), internal scroll works.
- [Completed] S4 amend: output block now uses `<descriptor>` placeholders (`spMarkerJsonPlaceholderForFields`) instead of concrete example values — the model fills current state, no copy risk. Field-rules list keeps `示例「X」` in place. `示例块使用字段示例值` toggle + `exampleUseDefaults` retired (key kept whitelisted, ignored).
- [Completed] S8 amend: removed the 注入当前消息 button (redundant — block-present auto-parses, block-absent → 重试) + its help line + handler.
- [Completed] Clarity: 提示词指令 now states "你只需写这段开头指令 … 其余由引擎自动附加" (matches the user's mental model of the auto-assembled boundary).
- [Completed] Docs: SPEC.md amendment note + S4/S8/S9 revised; agent.md / architecture.md / AUTHOR.md dereference the removed toggle & button.
- [Completed] Verified: build 5167, `node --check` clean; standalone print of the assembled prompt confirms placeholders in the output block + labelled examples in the field rules; edit-modal fix verified in the live harness (chrome-devtools, deployed build). Numeric-input dark styling also confirmed live (modal inputs render dark).
- Note: the harness toolbar still shows "SP 刷新"/"SP 重载" — those come from the dev-loader wrapper, not the shipped engine (toolbar.js has no refresh button; build.js ships SP 面板 only). Not a regression.

## 2026-07-06 / Session 1 (v3 regrounding)

Spec re-locked via questionnaire → `SPEC.md` (S1–S11). Full plan: `~/.claude/plans/linear-floating-tulip.md`.

- [Completed] S1/S3/S5 — removed all auto/fallback generation; `runStatusGeneration` is the only generateRaw, reachable only from 重试 (minimal payload: instructions + optional prev values + last message + schema); zero-fields retry errors. store.js trimmed engine/card keys, added `retryIncludePrev`.
- [Completed] S11 — `SP_CARD_ALLOWED_KEYS` + `spFilterCardKeys`; `spCharDefSave` filters patch + merged (real enforcement of the whitelist agent.md long claimed).
- [Completed] S2/S10 — 生成 tab rebuilt: read-only 注入内容预览 + editable 提示词指令 (card) + 深度/角色 (engine) + 重试上下文 toggle; removed 自动注入 toggle, regen-mode, and the entire preset-merge/history 高级生成设置 block.
- [Completed] S4/S8 — field 默认值 → 示例值 everywhere (AI-facing only, never rendered); 注入当前消息 button; adoption sets `exampleUseDefaults:true` + re-renders the open settings window (fixes the 字段-tab instant-load bug); `{{name}}` default tokens removed.
- [Completed] S6/S7 — `SP_IFRAME_GLOBAL_CSS` + `--sp-*` var block (`spBuildThemeVarBlock`); layoutgen emits markup + bar calc only; theme knobs expanded (标题/边框/主文字/按钮×3 colours with ↺-follow + 按钮折叠 + 字体链接); `{sp_actions}` = 重试+编辑 only, fold-aware.
- [Completed] Docs: `SPEC.md` (new), `architecture.md` (v3 rewrite), `agent.md` (index/router/rules refresh), `AUTHOR.md`, build.js info/buttons (SP 刷新 removed).
- [Completed] Harness verification (build 5210, 0.3.0-dev, chrome-devtools MCP on Seraphina): injected `status_panel_instructions` = exact 生成-preview text (role system, 示例 + tag block); 生成 tab has preview/深度/角色/示例/重试 and NO 自动注入/regen/preset (S2/S10); 样式 tab all 11 knobs + 6 ↺ resets, changing 按钮颜色 live-updated the preview `--sp-btn-color` unsaved (S7), 按钮折叠 → `.sp-actions-fold` chip; saved card template has NO chrome CSS, bar-calc only (S6); live panel renders dashes for empty values + 重试/编辑, no 设置, fold matches `buttonsCollapsed` (S5/S7/S10); card def server-side = only the 11 whitelisted keys, no API key, no regenMode (S11). Code-verified (not run, to avoid chat-data/API spend): 注入当前消息 execution (S8), retry payload (S3). No card writes during tests.

## Follow-Up
- [ ] Dead panel-chrome CSS in styles.js (`.sp-preset-*`, `.sp-prev-*`, `.sp-adv`) is now unused — harmless; strip in a later cleanup pass.
- [ ] Snapshot anomaly (S3 2026-07-05): reset via UI pipeline + verify server-side, never `window.__x` stashes.
- [ ] Harness housekeeping: pre-existing duplicate `Seraphina.png` character — user decision to delete.

## Prior Sessions
- 2026-07-05 S3: 简易 live theme v1, web-font URL (@import split), `exampleUseDefaults` v1.
- 2026-07-05 S2: greeting-prefill bug, schema-aware markerSig, field adoption, 状态块 preview.
- 2026-07-05 S1: v2 Phases 1–6 + T1–T10 matrix + docs rewrite.

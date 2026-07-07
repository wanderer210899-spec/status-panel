# Implementation Plan — status-panel

## Current Session — 2026-07-07 / Session 5 (Firefox mobile: panel/preview never render)

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

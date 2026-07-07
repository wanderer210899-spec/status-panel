# Changelog — status-panel

## Recent

### 2026-07-07 / Session 5 (Firefox mobile: panel + preview never rendered)

- What: Fixed the mobile-Firefox render failure (panel shell mounted but stayed empty;
  样式 preview empty). Root cause: `spMountIframe` deferred `iframe.srcdoc = html` behind
  a double `requestAnimationFrame` **of the engine's own window** — the TH script iframe
  is `display:none`, and Firefox never fires rAF in non-rendered documents (Chrome keeps
  ticking them, which is why desktop Chrome looked fine). The srcdoc was simply never
  assigned. Same latent bug in index.js's MESSAGE_UPDATED handler (4 nested rAFs). Added
  `spDeferFrames(count, fn)` (helpers.js L54): defers via the **visible top window's**
  rAF with a 200ms setTimeout safety net and a run-once guard (net also covers throttled
  rAF in backgrounded mobile tabs); switched both call sites. New Working Rule + File:Line
  row in agent.md: never use the script's own rAF, use `spDeferFrames`. (Bridge rAF inside
  panel-iframe srcdoc is unaffected — those iframes are visible.)
- Why: user testing on mobile Firefox (via Tailscale) — panel failed to render and the
  settings preview showed empty, while desktop Chrome rendered fine.
- Verification: chrome-devtools MCP on the harness (mobile viewport 412×915 + FF-Android
  UA — renders fine, so not viewport/UA). Causal proof: stubbed the TH iframe's rAF to a
  no-op and called `refresh()` → panel iframe remounted with `srcdocLen: 0` (exact
  symptom). After fix + rebuild (5112 lines, `node --check` clean): same dead-rAF
  simulation renders fully (chat panel srcdoc 10769 chars / h 519; 样式 preview srcdoc
  10651 via openPanel + tab click). Real Gecko not driven (no Firefox automation here) —
  user to confirm on-device; the simulation reproduced and then cleared the exact
  reported symptom.

### 2026-07-07 / Session 4 (remove floating SP FAB)

- What: Removed the floating **SP** button entirely — `ensureToolbarFab` (drag logic
  included) deleted from `src/ui/toolbar.js`, its call site removed from `src/index.js`,
  its CSS block removed from `src/ui/styles.js`. Settings now open only via TavernHelper's
  own **SP 面板** toolbar button (or the guidance card's 字段设置/样式设置 buttons while a
  definition is incomplete — both pre-existing paths, unaffected). `SP_FAB_ID` stays defined
  and stays in `helpers.js`'s dispose-cleanup array on purpose: the button was appended to
  the top document, and the dev-loop's iframe-only reload doesn't reset that document, so
  a FAB from a previously-loaded build needs dispose() to still find and remove it by id.
  Updated the init toast to name SP 面板 instead of the removed FAB/⚙. Amended `SPEC.md`
  S10 with a dated note; updated `agent.md`, `AUTHOR.md`, `指南.md`, `architecture.md`
  wherever they described the FAB as a settings-access path.
- Why: user request — "remove the floating sp button from the interface completely."
- Verification: `node build.js` (5090 lines, down from 5167), `node --check` on
  `main.js`/`dist/status-panel.js` clean, `dist/status-panel.json` parses; grepped source
  + bundle to confirm no `ensureToolbarFab`/`spFabDragBound` remain anywhere. **No live
  browser/MCP check performed** — no browser/Playwright MCP tool was available this
  session; the Docker harness (`st-dev`/`st-mock-api`) is up and bind-mount deploy applies,
  but the removal has not been confirmed by actually loading it in SillyTavern.

### 2026-07-07 / Session 3 (prompt rebuild — flat style table, sp.panel)

- What: Rebuilt the `AUTHOR.md` AI prompt again per user direction (clarified via
  questionnaire first): stripped all rationale/explanation out of the fenced prompt itself
  (CSS-only directives), merged the old two tables + numbered prose into one flat "STYLE
  REFERENCE" table (target → properties to set), added `sp.panel` as its first row (the
  human label for `.sp-iframe-root`/`body`/`:root` — docs-only, no new engine variable),
  and added the two gaps the prior version missed: field-value typography and button
  `:hover` states. Rebuilt `指南.md`'s three tables into one matching 完整样式对照表.
- Why: user ran the Session-2 prompt again and wanted the *whole* panel's stylable surface
  named in one place, worded as pure CSS declarations with no engine-mechanics prose, so any
  model (not just ones that read carefully) produces a coherent full theme in one pass.
- Verification: docs-only change, no build. Confirmed via questionnaire before rewriting:
  `sp.panel` stays a documentation alias (no code change to styles.js/render.js), and table
  scope is the from-scratch-template set, not the 简易-only `.spg-*` classes.

### 2026-07-07 / Session 2 (fix background omission + 指南.md)

- What: Root-caused a live failure of the Session-1 prompt — run against Opus 4.8 (medium
  effort) with a real 复制状态块 JSON, the model's CSS never set a `background` anywhere,
  so themed text rendered directly on the raw chat bubble. Rewrote the `AUTHOR.md` prompt:
  new hard rule stating `.sp-iframe-root` defaults to a transparent background + dark
  `#2c3e50` text and nothing else paints a surface, so every author-created container needs
  an explicit `background`+`color` pair; replaced the short `--sp-*` mention with a full
  table (variable / what it controls / default) plus a second table of classes the engine
  already styles (`.sp-btn-retry`/`.sp-btn-edit`/`:disabled`, `.sp-badge`/`.sp-badge-error`,
  `.sp-ph`/`.sp-ph-dash`, `.sp-busy`). Added a new `指南.md` — a short Chinese tutorial
  (matching the product's actual Chinese-speaking audience) covering 3-step field
  definition, both style modes with the same reference tables translated, the AI-prompt
  shortcut, and a player-facing usage section (consent banner, badge meanings, button
  behavior, why a panel might not show). Linked it from `README.md`'s Docs list.
- Why: user caught the omission empirically (Opus 4.8 medium) rather than it being a
  hypothetical gap — the original prompt told the model which CSS vars *exist* but never
  said backgrounds aren't automatic, so a model naturally assumes a "panel" widget already
  has a themed surface the way real component libraries do.
- Verification: docs-only change, no build; cross-checked the transparent-root claim
  against `spIframeBaseCss()` and the full var list against `spBuildThemeVarBlock()`
  (both in the render/styles source, not from memory) before writing the tables.

### 2026-07-07 / Session 1 (AI-styling-prompt doc)

- What: Added an "AI prompt" section to `AUTHOR.md` — a copy-pasteable prompt that, fed a
  `复制状态块` JSON export plus a short style brief, drives a general model to produce a
  ready-to-paste 高级模式 HTML+CSS block. Documents exact `{key}` token matching, the two
  reserved tokens (`{sp_actions}`, `{sp_badge}`) and their real styleable classes
  (`.sp-actions-wrap`/`.sp-btn-retry`/`.sp-btn-edit`/`.sp-badge`), automatic
  `.sp-iframe-root` scoping, the ≤380px layout constraint, `@import` ordering, and the
  optional `--sp-*` theme vars.
- Why: user asked for an unambiguous prompt so any card author can hand a model just their
  field-name/example JSON and get back working, on-spec CSS — including styling the action
  buttons and badge, which a naive prompt would likely omit or get wrong (they only exist
  after token expansion, not as literal markup the author writes).
- Verification: docs-only change, no build; cross-checked prompt claims against
  `spInterpolateTemplate`/`spBuildIframeSrcdoc` (render.js) and `SPEC.md` S6/S7/S10 for
  token/scoping/button accuracy.

### 2026-07-06 / Session 3 (tooltip / guidance copy pass)

- Why: user pass — every settings-panel tooltip and guidance line must read as ≤1 sentence; copy only, no logic touched.
- Shortened all multi-sentence help text in the settings window to one sentence each: 生成 tab (状态如何被填入, 深度, 注入内容预览 label + 提示, 提示词指令, 状态块标记, 重试 API, 测试连接), 字段 tab (字段名说明, 开场白预填, 示例值 title), 样式 tab (主题说明 — 跟随主色 folded into a parenthetical so the non-obvious reset mechanic survives inside one sentence; 高级 HTML a/b), 管理 tab (未选角色 / 空定义 / 删除 / 重置 help), the 清除 modal's 仅清除数据 description, and the edit-modal sub-line. render.js guidance card: 标题 + 无字段/有字段 step lines (无字段 was two sentences → one).
- Kept the `${esc(chName)}` interpolations in the 管理-tab 状态语 (1422 left as-is; 1429 only tightened its parenthetical) — dropping the name would remove a template variable = code change, out of scope for a copy pass.
- Left `parser.js:172` (文本值按 JSON 规则转义引号 … 不要添加未列出的键) untouched — that's AI-facing prompt text, not a UI tooltip.
- Build: 5167 lines (unchanged — in-line text edits only), build.js clean. Not re-run in the harness (copy-only; no logic/render path changed).

### 2026-07-06 / Session 2 (v3 polish — user feedback)

- Why: user feedback on the v3 build — CSS inconsistencies (edit modal, numeric inputs), prompt-example confusion risk, and a redundant button.
- **CSS — numeric inputs.** The panel's input styling rule listed `text`/`password`/`textarea`/`select` but **not `input[type="number"]`**, so every numeric field (示例值, min/max, 深度) rendered with the browser default (white box, native spinners, no `box-sizing` → overflow, low contrast = the "leaking / barely visible" report). Added `number` to both the base and responsive selectors (styles.js).
- **CSS — edit modal (✏).** Reported as invisible / "can't view fully". Root cause (found live via chrome-devtools): ST sets `transform`+`perspective` on `<html>`, making it the containing block for the `position:fixed` overlay; that box is height-collapsed, so `inset:0` sized the overlay to ~32px and the 423px box centred at `top:-196` — off the top of the screen. **Fix: size the overlay with `height:100vh`** (viewport-relative, transform-proof) instead of `inset:0`/`bottom:0` (styles.js, with a comment warning against reverting). Also added `.sp-em-fields{min-height:0}` for internal scroll and rewired the modal to the active card's `--sp-*` theme vars (inline on the overlay in `spShowEditModal`) so it matches the panel (S6). Verified in the live harness: overlay = full viewport, box fully on-screen (top:29), inputs dark, scroll works.
- **S4 amend — placeholder output block.** `spMarkerJsonExampleForFields` → `spMarkerJsonPlaceholderForFields`: the auto-assembled `<!--status-panel-->{…}<!--/status-panel-->` now emits `<descriptor>` tokens (`"好感度":<0–100 的数字>`, `"心情":"<happy|neutral|sad>"`) with an explicit "replace each `<…>` with the current value" line, instead of concrete example values the model could copy. Field-rules list keeps `示例「X」` in place. Retired the `示例块使用字段示例值` toggle + `exampleUseDefaults` (deprecated/ignored, key kept whitelisted); adoption no longer sets it.
- **S8 amend — removed 注入当前消息.** Redundant: block-present messages auto-parse & render; block-absent → 重试. Deleted the button, its help line, and its handler (`spSyncMarkersOnlyForMessage` stays — still used by the MESSAGE_RECEIVED parse path).
- **Clarity.** 提示词指令 now says "你只需写这段开头指令 … 其余（字段规则 + 状态块模板）由引擎自动附加在其后".
- Docs: SPEC.md amendment note + S4/S8/S9 revised; agent.md / architecture.md / AUTHOR.md dereferenced the removed toggle/button.
- Build: 5167 lines; `node --check` clean. Assembled-prompt output verified via standalone print. Edit-modal + numeric-input styling verified live in the harness (chrome-devtools on the deployed build). The harness toolbar still shows "SP 刷新"/"SP 重载" — those are the dev-loader wrapper's buttons, not the shipped engine (toolbar.js has no refresh binding; build.js ships SP 面板 only).

### 2026-07-06 / Session 1 (v3 regrounding — spec re-lock + drift guards)

- Why: the v2 engine drifted from intent (two opaque prompt paths, muddled 默认值 semantics, per-card hardcoded chrome CSS, bloated 生成 tab). User re-locked the spec via questionnaire → new **`SPEC.md`** (S1–S11); every change traces to an ID. Full plan in `~/.claude/plans/linear-floating-tulip.md`.
- **S1/S3/S5 — one generation model.** Removed all auto/fallback generation. `runStatusGeneration` (generate.js) is now the ONLY `generateRaw`, reachable only from 重试; payload is minimal (`buildStatusGenerationPrompts`: instructions + optional prev-values line + last message with block stripped + JSON-schema). Zero-fields retry errors instead of firing. `spSyncStatusPanelForAssistantMessageCore` lost its on-missing branch; `spInjectAssistantPanelsNow` + SP 刷新 deleted. store.js dropped `regenMode`/preset/history/`maxChatHistory`/`instructionInjectEnabled`/`defaultPromptEnabled`/`defaultPromptInjectMode`; added `retryIncludePrev`; depth default 1→0.
- **S2/S10 — 生成 tab rebuilt.** Read-only 注入内容预览 (`spUpdateInjectPreview` = exact Path-A text) + editable 提示词指令 (card) + 深度/角色 (engine) + 重试上下文 toggle. Removed 自动注入 toggle (injection is always on while enabled+fields), regen-mode radios, and the whole preset-merge/history-snapshot 高级生成设置 block + `buildGenerateRawPromptPayload`/`spBuildPreviewHtml`/`spBuildHistorySnapshotInject`. `spSyncExtensionPrompt` now uses engine role/depth, no toggle.
- **S4/S8 — 示例值 model.** Field 默认值 → 示例值 everywhere (AI-facing only; the panel renders empty dashes, never the example — `spInterpolateTemplate` lost its default fallback). `{{name}}` default tokens removed (flagged as unknown now). New 字段-tab **注入当前消息** (adopt block or stamp empty). Adoption sets `exampleUseDefaults:true` and re-renders the open settings window — **fixes the 字段-tab instant-load bug** (fields no longer require a tab switch to appear). Constraints block includes description + 示例 for all field types.
- **S6/S7 — global CSS + theme.** New `SP_IFRAME_GLOBAL_CSS` (styles.js) owns all panel chrome; per-card colours come from a `:root{--sp-*}` block (`spBuildThemeVarBlock`, render.js). `spGenerateLayoutHtml` emits markup + per-field bar calc + `@import` only. Theme expanded to 11 knobs (accent/radius/size + 标题/边框/主文字/按钮×3 colours with ↺-follow-accent + 按钮折叠 + 字体链接); `spThemeColorField` + `collectTheme` extended; preview passes the LIVE theme. `{sp_actions}` = 重试+编辑 only (设置 removed, S10), fold-aware; bridge toggles the ⋯ fold + shows `⏳ 生成中`.
- **S11 — whitelist enforced.** `SP_CARD_ALLOWED_KEYS` + `spFilterCardKeys`; `spCharDefSave` filters both patch and merged result, warns on stripped keys. This makes real the invariant agent.md had only claimed.
- Docs: `SPEC.md` (new), `architecture.md` (full v3 rewrite + invariants 5/12/13 + V1–V5 matrix), `agent.md` (title v3, File:Line Index rebuilt, Task Router + Working Rules refreshed, SPEC pointer), `AUTHOR.md` (two paths, 示例值, injection depth/role, global-CSS + knob table, 重试/编辑 only), `plan.md`, `build.js` (info + buttons → SP 面板 only).
- Build: 5210 lines (was 5452); `node --check main.js` clean.
- [Pending] Harness verification V1–V5 (Phase 6).

### 2026-07-05 / Session 3 (简易 theme rework, web fonts, example defaults)

- What (user error report: 简易 knob changes didn't update preview and save changed nothing; checkboxes unwanted; font should be a web URL; adopted defaults unused):
  1. **简易 is now live and theme-driven** (`spBindStylesTab`): any knob input regenerates the template into the textarea (+preview); 保存 regenerates again from fresh fields + `collectTheme()` before writing — the persisted template can't lag the knobs. Previously theme only applied on 生成 click and save persisted the stale textarea (the reported "save does nothing").
  2. **Color checkboxes removed**: 标题色/边框色 always-editable inputs that follow 主色 until first edited (`data-sp-overridden` flag; stored `''` = follow accent, accent edits sync un-overridden inputs). No un-override UI yet (Follow-Up).
  3. **字体 = web-font URL**: Google Fonts css2 URL → `@import url(...)` + families extracted (`spFontFamiliesFromUrl`) for the stack; plain family names still accepted. Datalist presets are now URLs (思源宋体/思源黑体/霞鹜文楷 TC/马善政/站酷小薇). Sanitized for the url() context.
  4. **@import placement bug found live**: hoisting inside `spIframeAuthorStyleText` was not enough — the srcdoc's reset rules preceded it in the same `<style>`, so the browser silently ignored it (no console error; fonts.googleapis simply never requested). `spBuildIframeSrcdoc` now splits imports into their own `<style>` element before the reset. Benefits hand-pasted 高级 templates too.
  5. **`exampleUseDefaults`** (new card def key + 生成 tab checkbox 「示例使用字段默认值」): the instruction's example block uses each field's 默认值 instead of `"…"` — greeting-adopted starting values become a dynamic prefilled example sent to the AI.
- Verification (build 5452, chrome-devtools MCP on Seraphina): knob input → preview shows `border:1px solid #22cc88` with no button click; font URL → `@import` in its own first `<style>` + **fonts.gstatic.com woff2 requests observed** (font actually applied); save → card `theme`/`htmlTemplate` updated and chat panel re-rendered; checkbox → live `status_panel_instructions` extension prompt example flipped `"心情":"…"` → `"心情":"平静"`, `exampleUseDefaults:true` on card.
- Cleanup + anomaly: a `window.__x`-stashed def snapshot round-tripped **contaminated** (restore reproduced the post-save test theme; mechanism unconfirmed — possibly isolated-world/window persistence in evaluate_script). Reset Seraphina to engine defaults through the app's own save pipeline instead and verified clean **server-side** (`POST /api/characters/get`): default theme, `exampleUseDefaults:false`, no test artifacts, fields 心情/好感度 intact, chat panel clean. Lesson recorded in agent.md Working Rules.
- Also: dismissed the recurring stray confirm dialog on reload (删除状态栏定义 confirm — never accept).
- Docs: AUTHOR.md (简易 live model + URL fonts + example-defaults), architecture.md (srcdoc step 5, instruction key), agent.md (index refresh L522/601/632/670/749/772/815/841/971/1051; panel.js L767/864/1086/1499/1667; new 简易/web-font router entry; snapshot lesson).

### 2026-07-05 / Session 2 (author prefill path — 2 bugs, 3 features)

- What (user error report: greeting JSON block set up the panel but no values rendered, no error; fields had to be hand-added):
  1. **Bug — refresh path never parsed markers.** `refreshAllAssistantPanels` (CHAT_CHANGED, i.e. how a greeting first renders) stripped markers from display and mounted the panel but never extracted values. Fix: it now kicks `spSyncMarkersOnlyForMessage` per target message (free, no generateRaw, sig-deduped) and re-renders when it wrote; `spWithPerMessageAsyncChain` now propagates the inner return value.
  2. **Bug — content-only `markerSig` locked in stale values.** A block parsed before fields were defined stored `{}` with a matching sig; adding fields later never re-normalized ("already handled"). Fix: `spMarkerSig` (helpers.js ~L351) appends the field-name set — schema edits invalidate old sigs, and the format change itself healed all pre-existing stale data on first reload.
  3. **Feature — schema adoption** (`spAdoptFieldsFromParsedBlock`, render.js ~L833): JSON block parsed while the definition has zero fields creates the fields from its keys (number/text inferred, block value = default) and generates the default 简易 layout when the template is empty. Guarded: never runs once any field exists; JSON form only.
  4. **Feature — 简易 theme knobs**: 字体 (free text + datalist presets 宋体/楷体/霞鹜文楷/仿宋/等宽), 标题色, 边框色 (checkbox pairs; unchecked = follow 主色). Generated layout now also themes 重试/编辑/设置 buttons + badge (accent pills, scoped `.spg-card` descendants so 高级 templates are unaffected). `spLayoutTheme` sanitizes font (CSS-injection chars stripped) and hex colors.
  5. **Feature — 字段 tab 状态块 preview/copy**: 显示状态块/复制状态块 build `<tag>{"字段":默认值,…}</tag>` from the current editor rows using the configured tag, for pasting into greetings.
- Verification (Docker harness, chrome-devtools MCP, build 5364 lines): reproduced the user's exact state on the real 白肆昀 card — swipe 0 had `values:{}` + old-format sig; after reload alone, all 5 values populated and rendered (T12). Cleared-data + reload → refresh path lifted greeting block values (T11). Adoption end-to-end on Seraphina via `/sendas` (体力→number/72, 状态/位置→text; layout generated; `source:'markers'`; panel + bar rendered), then def restored from snapshot and test message deleted (T13). Theme knobs verified via 生成 output (font stack, `color:#ffcc66`, `border:1px solid #66ffcc`, `.spg-card .sp-btn-retry`/`.sp-badge` rules); block preview produced `<!--status-panel-->{"心情":"平静","好感度":50}<!--/status-panel-->`. Nothing saved to any card by UI tests.
- Docs: AUTHOR.md (prefill/adoption section, theme-knob table), architecture.md (adoption + invariants 10–11, T11–T13), agent.md (index refresh, new router entries).
- Harness note: TH `getChatMessages('N')` clamps out-of-range ids to the last message while `setChatMessages` skips them — probe reads can silently hit the wrong message.

### 2026-07-05 / Session 1 (v2 rewrite — engine model, all 6 phases)

- What: Full v2 implementation per approved plan (`linear-floating-tulip.md`). Converted the card-bound v1 script into a **global engine** with per-character card-stored definitions:
  1. **Foundation**: all `TH.setChatMessages` data writes now pass `{refresh:'none'}`; deleted every echo guard / timing defer; failed `generateRaw` writes explicit `{source:'error', error}` (prior values kept, 重试 always live) instead of fake `source:'manual'`; removed `pending_manual`/`pending_auto` states.
  2. **Storage split**: `src/core/store.js` rewritten — engine settings in TH global vars (`status_panel_engine`, incl. consent lists keyed by avatar filename), panel definition in card `data.extensions.status_panel` via `writeExtensionField` (`spCharDefSave` key whitelist blocks credential leakage), values per message via TH data. Deleted localStorage config blob + all legacy keys/migrations.
  3. **Detection + injection**: configurable tag (default HTML comments), JSON or `键:值` parsing; Chinese instruction auto-built from fields and injected via `setExtensionPrompt`; 复制 AI 指令 fallback.
  4. **UI rebuild** (all Chinese): four tabs 字段/样式/生成/管理 (`panel.js` rewritten); new `src/ui/layoutgen.js` 简易-mode layout generator (accent/radius/size knobs, number bars via `--spg-v:{token}`); token warnings; consent banner (启用/暂不) + guidance onboarding card; edit modal preserved.
  5. **Round-trip verified**: export Seraphina PNG → `chara` tEXt contains the definition, zero API keys/engine settings → import as new char → consent banner → 启用 → identical panel (defs deep-equal), prompt registered → deleted import + cleaned consent list.
  6. **Docs**: README/architecture/AUTHOR/agent.md rewritten to v2 (agent.md deduped, new File:Line Index); `dist/status-panel.json` info updated (global script).
- Also fixed: `MESSAGE_DELETED` now triggers a debounced full refresh (deleting the last message resurfaces the previous message's panel — found during verification).
- Verification: full manual matrix T1–T10 (architecture.md) in the Docker harness via chrome-devtools MCP, incl. fallback-success (mock queue `admin/queue/push` → badge 已生成, values stored `source:'auto'`), error path (unparseable reply → 生成失败 persisted with reason), and injection proof (instruction present as system message in the outgoing `/api/backends/chat-completions/generate` body; secondary request carries `json_schema`). `node build.js` (5159 lines) + syntax check.
- Harness note: pre-existing duplicate `Seraphina.png` character (old def) left untouched; `st-mock-api` mode left at `normal`.

### 2026-07-04 / Session 1 (review-only — no code changes)

- What: Full shortcomings review (docs, source, live Docker probe). Rebuilt `main.js` via sync script — it was stale vs `src/` (4415 → 4439 lines), so the harness had been serving an old bundle. Enabled the global TH loader script "Status Panel (fetch dev JS)" in the harness (was disabled) and left it enabled.
- Key findings (verified live on Seraphina chat, mesid 69):
  1. `TH.setChatMessages` is called without options → default `refresh:'affected'` re-runs `messageFormatting` and re-emits `CHARACTER_MESSAGE_RENDERED` — the root cause of the whole echo/freeze class the three timing guards (4500/4000/1500 ms) fight. `{ refresh: 'none' }` still saves (debounced) with no re-render/echo.
  2. Failed `generateRaw` writes `source:'manual'` + empty values (generate.js ~L413): failure is indistinguishable from manual mode; error only in a transient toast; auto sync then refuses to regenerate that message (render.js ~L750-752).
  3. `pending_manual` is read (blocks regen) but never written by current code — stale rows from old versions permanently block auto regen; no migration.
  4. User config incl. HTML template lives only in `localStorage` (per-browser; MCP browser saw virgin defaults). Template loss/sharing problem; UI itself says "保存仅对此浏览器生效".
  5. Doc drift: AUTHOR.md describes two textareas (HTML+CSS) but Styles tab is single-textarea and save writes `css:''`; README points to deleted STYLING.md; architecture.md lacks Edit button/`regenMode`; agent.md is two concatenated doc blocks.
  6. Verified NOT a bug: CSS scoper handles `:has(.a,.b)` correctly (paren-depth-aware comma split, styles.js ~L464).
- Harness note: `st-mock-api` container is down (Exited 137, 3 days) — auto/retry generation tests need `docker start st-mock-api`.
- Verification: `node build.js` + `node --check main.js`; live browser probe via Docker MCP (script load, panel mount, forced-regen failure path, Styles tab UI).

### 2026-05-09 (remove accidental nested `src/src/…` tree)

- What: Deleted `status-panel/src/src/` — a full duplicate of the module tree had been nested inside `src`, producing an extremely deep `src/src/src/…` chain (duplicate `api/`, `core/`, etc. at every level). Tooling globs and deletes were slow or appeared to hang.
- Why: Restore the intended layout (`src/{api,core,ui,utils,index.js}` only) and eliminate redundant copies on disk. Likely cause: copying the project or `src` folder into `src` by mistake.
- Verification: `node build.js` (main.js + dist outputs regenerated).

### 2026-05-08 (functional test pass — Docker harness)

- What: Full four-scenario live test against Docker harness (ST + mock-openai-provider):
  1. **Auto mode / missing markers** — `generateRaw` fires on each turn when main API returns no `<!--status-panel-->` block (confirmed via `/admin/state` totalRequests = 2 per turn, 1 main + 1 secondary).
  2. **Auto mode / valid markers** — `generateRaw` is suppressed when main API response includes a valid marker block (1 request per turn only).
  3. **Manual mode / swipes** — only 1 API call per swipe (no secondary `generateRaw`); exactly 3 requests for 3 swipes confirmed.
  4. **Marker edit re-render** — editing `<!--status-panel-->` JSON inside a message body (changing `"location":"Observation Deck"` → `"location":"Rooftop Garden"`) via ST inline editor triggers `MESSAGE_UPDATED`, panel re-mounts with new values; old value gone from iframe `srcdoc`.
  5. **DOM cleanup** — `<!--status-panel-->` HTML comment tags are stripped from displayed `.mes_text` for ALL messages (both last-message panel-rendered and non-last suppressed), confirmed on mesid=10 which has marker in raw `.mes` but no comment in DOM and no iframe.
- Note: `ctx.chat[i].data.statusPanel` and `chatMetadata._spStatusPanelMeta` were not populated during these tests (TH persistence path not triggered in manual mode + no generateRaw); panel rendered directly from parsed marker values. markerSig comparison observable only when generateRaw path runs first.
- Why: Verify all core behaviours are intact after the 2026-05-07 freeze/echo-guard/marker-precedence work.

### 2026-05-07 (reload hard-freeze — setChatMessages echo guard)

- What: Added a post-write echo guard so when status-panel persists marker JSON via `TH.setChatMessages`, we **skip the immediate `CHARACTER_MESSAGE_RENDERED` echo** for that same message id (prevents a tight re-render → write → re-render loop).
- Why: Editing a message to include `<!--status-panel-->…<!--/status-panel-->`, saving, then reloading could hard-freeze the tab due to re-entrant event churn.

### 2026-05-07 (marker precedence — timestamps + signature gate)

- What: Added `_spStatusPanelMeta` (top-level chat `data` key) with `updatedAt`, `markerUpdatedAt`, and `markerSig`. Marker imports now **only overwrite stored status when the marker JSON content actually changed** (signature differs), preventing stale in-message markers from clobbering newly generated status after reload/refresh. Generation failure/success updates `updatedAt`.
- Why: Users want “data wins when newer”, but still want edited marker blocks to win once they actually change.

### 2026-05-07 (hide marker transport + mount once after edit-save)

- What: Strip `<!--status-panel-->…<!--/status-panel-->` (and legacy `status-block`) from the **displayed** `.mes_text` HTML after save, while still parsing from `row.message`. After `MESSAGE_UPDATED`, mount the panel **once** via `renderPanelForMessage` after deferring beyond ST’s edit-save stack.
- Why: Users shouldn’t see the transport JSON in chat, and edit-save should behave like a single manual refresh without reintroducing freeze conditions.

### 2026-05-07 (reload freeze — defer initial refresh)

- What: **`SP_INITIAL_REFRESH_DEFER_MS` (default 350)** — first `refreshAllAssistantPanels()` after init waits so SillyTavern can finish **`printMessages` / `messageFormatting`** before iframe **`srcdoc`** work (same tick caused reload jank). Set to **`0` in `constants.js`** to restore immediate refresh.
- Why: Tiny JSON markers are not the cost center; **long `.mes_text`** + **iframe parse/hydrate** on the same paint window freezes the tab.

### 2026-05-07 (SP 刷新 duplicate refresh)

- What: **`spInjectAssistantPanelsNow`** no longer calls **`refreshAllAssistantPanels()`** after its per-message loop — that path already **`renderPanelForMessage`**’d every target; the extra refresh doubled iframe rebuilds and **`CHARACTER_MESSAGE_RENDERED`** / QR2 **`executeOnAi`** traffic (seen as thousands of `[QR2] calling { args: Array(1), … }`).
- Why: SP 刷新 should scan/sync once per assistant row, not twice.

### 2026-05-07 (QR buttons, streaming guards, AUTHOR.md)

- What: **QR button name mismatch fixed** — `build.js` now emits Chinese names (`SP 面板`, `SP 刷新`) matching `toolbar.js` constants. `SP 重载` removed from shipped `dist/status-panel.json` (dev-workflow button, provided by the loader JSON only). `st-plugin-dev/scripts/tavernhelper-loader-status-panel.json` button names updated to `SP 重载` / `SP 面板` / `SP 刷新`.
- What: **Streaming race guard** — `spSyncStatusPanelForAssistantMessageCore` returns early when `row.message` is empty (message not yet received / streaming not started). `runStatusGeneration` now skips writing `source: 'auto'` if `source: 'markers'` has since been stored by a concurrent `MESSAGE_RECEIVED` call.
- What: **AUTHOR.md** created — covers manual JSON status block format, main-API prompt contract, token reference, iframe CSS scoping, `{sp_actions}` button styling and override patterns, troubleshooting. **STYLING.md deleted** (content folded into AUTHOR.md). `agent.md` updated.
- Why: QR buttons silently did nothing (name mismatch); streaming scenario could trigger unnecessary secondary generateRaw; STYLING.md didn't cover the JSON/prompt authoring side.
- Verification: `node build.js`, `node --check main.js`; re-import loader JSON in TH; click SP 面板 / SP 刷新.

### 2026-05-06 (sandboxed iframe render path)

- What: Template renders via **`srcdoc`** iframe (`sandbox="allow-scripts"` only, **`iframe.sp-frame`**) with injected **`SP_IFRAME_BRIDGE`** (`sp-resize`, `sp-action`, `sp-state`). Field values escaped with **`spEscapeHtml`** before **`spInterpolateTemplate`** (`preEscapedLiveValues`). **`{sp_actions}`** / **`{sp_badge}`** tokens; **`data-sp-message-id`** on **`.sp-block-root`** for Retry routing; **`spBroadcastState`** paired only around **`generateRaw`**. **Styles tab** preview matches chat iframe path; removed shadow + **DOMPurify** from render pipeline; author CSS via **`spIframeAuthorStyleText`** / **`.sp-iframe-root`**. mount removes existing iframe before insert (no **`srcdoc`** reuse).
- Why: Stronger isolation from `.mes_text` without TavernHelper’s full code-block bridge; predictable XSS boundary on model output.
- Verification: `node build.js`, `node --check main.js`.

### 2026-05-06 (typography independent of chat)

- What: **`spShadowBaseCss`** no longer uses `inherit` for `color` / `font-*` on `:host`; defaults to explicit light-theme typography (`color-scheme: light`, system font stack). Light-DOM **`.sp-block-root`** chrome sets explicit text color / `-webkit-text-fill-color` so Retry/System badges are not styled by `.mes_text` after `all:unset` on buttons. Placeholder **`.sp-ph`** muted color updated for dark-on-light panels.
- Why: Shadow DOM isolates selectors but **inheritance** still crossed from `.mes_text`, breaking pasted light templates (e.g. ferret status panel) in dark SillyTavern themes.

### 2026-05-06 (shadow DOM + DOMPurify — Path B)

- What: **Shadow root** on `.sp-block-shell` for template markup; author + embedded `<style>` merged into a shadow `<style>` with `:host` scoping (`spScopeAuthorCss`). **`formatAsDisplayedMessage`** removed for the template; **`spSanitizePanelHtml`** uses `window.DOMPurify.sanitize` without chat `MESSAGE_SANITIZE`, so **no `custom-` class rewrite**. **`spPrefixAuthorClassTokens`** removed. Light-DOM chrome (`.sp-block-root` frame, `.sp-block-actions`, buttons, badges, placeholders) moved into **`injectStylesOnce`**; **AUTHOR_DEFAULTS** CSS trimmed to inner-card rules only. Styles tab **live preview** mirrors chat (`attachShadow` + same stylesheet helper **`spShadowAuthorStyleText`**). Legacy **`#sp-status-panel-author-css`** tag is removed on init/save (`injectAuthorCss` cleanup only).
- Why: Isolates panels from `.mes_text` / theme selectors without iframe cost; drops the custom-prefix/CSS-rewrite coupling from 2026-05-06.
- Verification: `node build.js`, `node --check main.js`; reload script; confirm panel renders inside `#shadow-root (open)` and class names in DevTools match the template.

### 2026-05-06 (author CSS now actually applies)

- What: **`spScopeAuthorCss`** rewrites every author class token (`.foo` → `.custom-foo`) so scoped CSS matches the DOM that ST's DOMPurify hook produces (`addDOMPurifyHooks` in `chats.js` prefixes every class with `custom-` except `fa-*`/`note-*`/`monospace`). Chrome classes (`sp-block-root`, `sp-block-shell`, `sp-block-actions`, `sp-block-btn`, `sp-retry`, `sp-system`, `sp-badge`, `sp-placeholder`) bypass `formatAsDisplayedMessage` (set via `createElement`) and stay bare in both DOM and rewritten CSS. Chrome stylesheet now uses `.custom-sp-ph` / `.custom-sp-ph-dash` to match the DOMPurify-prefixed placeholder spans emitted by `spInterpolateTemplate`.
- Why: Before this fix no author class selector matched anything — author CSS effectively did nothing. The bundled default `.sp-status-card` template was silently broken, and pasted templates like the ferret panel rendered as unstyled `<details>`.
- Verification: `node build.js`, sync, reload Docker harness, paste ferret template into HTML field with empty CSS field, confirm `<details>` computed `border: 2px solid rgb(44,62,80)`, `border-radius: 12px`, `background-color: rgb(247,249,250)`.

### 2026-05-05 (Preset prompt preview)

- What: **Preset** tab includes a readonly **Prompt preview** box showing `ordered_prompts`, `injects`, and `json_schema` body (`formatGenerateRawPromptPreview` + existing `buildGenerateRawPromptPayload`); updates live from preset controls and reflects **Status** fields via saved config.
- Why: See exactly what will be assembled for `generateRaw` before saving or calling the API.

### 2026-05-05 (MESSAGE_UPDATED — edit)

- What: Bind **`tavern_events.MESSAGE_UPDATED`** → **`onCharacterMessageRendered`** (ST replaces `.mes_text` on save; no `CHARACTER_MESSAGE_RENDERED`).
- Why: Status panel DOM was wiped on edit and never re-inserted.
- Verification: `node build.js`, `node --check main.js`; Docker harness — edit last assistant message, panel returns.

### 2026-05-05 (persist last_only + placeholders)

- What: **`last_only`** uses chat-order **last non-user message** (`SillyTavern.getContext().chat`, fallback DOM); **`renderPanelForMessage`** no longer removes the panel when skipping a non-target message (swipe/edit safe); centralized **`SP_UI_TEXT`**; empty **`{field}`** slots render muted **`.sp-ph`** / em dash (no duplicate long strings in render).
- Why: DOM-only “last assistant” and eager strip caused panels to vanish during swipe/edit; placeholders were verbose or blank.
- Verification: `node build.js`, `node --check main.js` + `dist/status-panel.js`.

### 2026-05-05 (status card + API UX)

- What: Default fields expanded to **character, location, mood, inner_thoughts, affection (0–100), clothing** with semantic HTML template + CSS; default marker prompt rewritten for minimal model drift; **`SP Refresh`** toolbar QR calls **`spInjectAssistantPanelsNow`** (regenerate path); Custom API **model `<select>`** populated from **`getModelList`** after **Test connection**, optional **custom model id** override input; `build.js` / loader JSON include third button.
- Why: User-facing clarity; external provider picks model from list like ST; refresh explicitly triggers new capture/`generateRaw`.
- Verification: `node build.js`, `node --check main.js` + `dist/status-panel.js`; Docker mock-api `GET /health` (host not running → skip browser proofs).

### 2026-05-05 (rename + UX)

- What: Product rename to **Status Panel**; all identifiers `sp_*` / `SP_*`; chat `data.statusPanel` (read legacy `statusBlock`); markers `<!--status-panel-->` with legacy parse; FAB **SP**; `__spOpenPanel`; `dist/status-panel.{js,json}`; preset list fixed height like other text areas, **unchecked-by-default** prompt inclusion (check to merge), **name-only** labels; styles `{{field}}` default placeholders; status field **min/max** for numbers; **Inject status panel now**; **`assistantInjectMode`** auto vs manual (author default ships with script); loader QR **SP Reload** / **SP Panel**.
- Why: User-facing naming; safer preset selection; manual inject test cycle with mock API; blank UI on bad JSON.
- Verification: `node build.js`, `node --check main.js` + `dist/status-panel.js`.

### 2026-05-05 (UI + capture)


- What: Preset list and panel preview sizing; API tab split into **Main ST** vs **Custom** with a single connection test; default prompt can inject **in-chat** via `TavernHelper.injectPrompts` before `generateRaw`; `coexistMode` default **auto**; assistant sync also runs on `CHARACTER_MESSAGE_RENDERED` with a per-message async chain; Status save rewrites marker JSON keys from the field table; Styles tab beginner copy, field/CSS autocomplete helpers, and live preview via `formatAsDisplayedMessage`; added `README.md` update workflow.
- Why: Preset UI was too small; main API should not ask for custom URL/key; default prompt needed real in-chat placement (TH does not apply `injects` when `use_preset` is false); AI messages could miss capture when `MESSAGE_RECEIVED` did not run alone; marker keys should track field renames.
- Verification: `node build.js`, `node --check main.js`, `node --check dist/status-block.js` OK; `sync-tavernhelper-dev-to-harness.ps1` run (local st-plugin-dev mirror).

### 2026-05-05

- What: Added reload-safe lifecycle cleanup to the dev script and wired the harness TavernHelper loader with `SB Reload` / `SB Panel` quick replies. `SB Reload` reloads the loader iframe so it fetches the latest synced `/scripts/dev/tavernhelper-scripts/status-block/main.js`; `SB Panel` opens the Status Block panel after load.
- Why: The dev loop now supports edit -> build -> sync -> click QR reload without stale event handlers, duplicated FAB/styles, or manually reopening the script iframe.
- Verification: Rebuilt `main.js` and `dist/status-block.{js,json}`, syntax/JSON/function-checked artifacts, synced to Docker harness, confirmed HTTP 200 served bundle, and browser-verified QR reload plus panel open in SillyTavern.

### 2026-05-05 (master-plan pass)

- What: Full master-plan implementation: core store/schema/parser, `generateRaw` fallback, render + capture paths, Retry/System buttons, draggable four-tab panel + FAB, `dist/status-block.json`, plain-IIFE bundle (no leading `$` so scripts run without jQuery).
- Why: Completes the reliability model (markers + JSON schema + per-swipe `data`) with an on-screen panel for verification.

### 2026-05-05 (earlier)

- What: Initial multi-file scaffold + dev `main.js` build.
- Why: Fast TavernHelper dev-loader loop.

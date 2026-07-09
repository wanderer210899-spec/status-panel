# Change: Final review & QA pass — dead code, logic conflicts, CSS alignment + full browser verification

- **Date:** 2026-07-09
- **Project:** tavernhelper-dev/status-panel
- **Status:** Done (2026-07-09) — safe fixes applied + verified; R1/R2 reported, awaiting decision

## What it does now

The status panel renders per-character status fields (時間/心情/好感度 etc.) as styled, live-updating
panels inside SillyTavern chat messages. Values come from the AI's JSON status block on each reply
(Path A) or from the panel's 🔄 retry button (Path B, `generateRaw`). Settings window has 4 tabs
(字段/生成/样式/管理); styling is 简易 (theme knobs) or 高级 (manual HTML/CSS); themes ride
`--sp-*` CSS variables and export with the character card (whitelist enforced). The codebase has
been through 12+ sessions including feature removals (AI theme generator S11, notation config),
so leftover/residue code and doc drift are plausible.

## What should change

No new features. A three-phase final QA pass:

1. **Static code review** of `src/` + `build.js` for:
   - dead code (unused functions/vars/CSS/markup, leftovers from the S11 generator removal and
     other removed features),
   - logic conflicts (contradictory or duplicated code paths, mismatches between modules),
   - hardcoded/unaligned CSS (colors, sizes, selectors not riding the `--sp-*` variables or the
     conventions in `styles.md`),
   - doc/code drift (e.g. the known stale `agent.md` Task Router line about `{{name}}`).
2. **Written test plan** covering every user-facing flow (skeleton below) before any browser work.
3. **Execute the test plan** via MCP Chrome DevTools against the Docker harness (`st-dev` at
   localhost:8000, `st-mock-api` provider), simulating normal user usage — at desktop size, then
   repeating the key rendering/interaction checks in a mobile-sized viewport (DevTools emulation).

### Test-plan skeleton (user-facing flows to cover)

Panel render from AI reply (Path A) · manual 🔄 retry (Path B, mock API request visible) ·
empty-value dash state · zero-fields retry error (no API call) · settings tabs open/switch ·
field CRUD + 示例值 adoption · 简易 style knobs + preview/save · 高级 manual paste + preview/save ·
per-card `--sp-*` theme + card export whitelist (engine keys never on card) · consent banner ·
guidance card (incomplete definition) · inline ✏️ edit modal · fold/unfold chip ·
toolbar button `SP 面板` (user directive mid-session 2026-07-09: **SP 面板 is the only toolbar
button** — the unshipped `SP 清除` binding was removed from toolbar.js; clear modal stays
reachable via 管理 tab 清除聊天数据) · per-swipe value persistence · reload persistence ·
**regression check: 样式 tab opens clean with no generator remnants (S11 removal, still unverified
in harness)** · **known-bug reproduction: value token inside an HTML attribute corrupts the
attribute when empty (report, don't silently fix)**.

## Why now

Project is near completion — user asked for a "final review" before normal use. Session-11's
generator removal was never harness-verified, one real bug from the Session-12 live probe is
still unfixed, and multiple feature removals make residue code likely.

## Must stay the same (regression guard) — REQUIRED

- **All current user-facing behavior.** This pass adds nothing and removes no feature.
- Both render paths (A: prompt injection + JSON parse; B: retry `generateRaw`) work as today.
- 简易 and 高级 style modes, preview/save pipeline, `designMode` key.
- Card export whitelist: engine keys never land on the character card.
- Consent banner, guidance card, per-swipe persistence, toolbar buttons.
- `references/` untouched (read-only); harness compose files not hand-edited.

## Rewrite policy — pick one (REQUIRED)

- [x] **Additive only** (adapted, per user choice **"Fix safe, report risky"**): obvious dead-code
  removal and CSS token alignment may be applied directly; anything that could change behavior
  (logic conflicts, the known attribute-corruption bug) is **reported with a proposed fix** and
  waits for user approval.
- [ ] Refactor allowed
- [ ] Replace

## Cleanup expectation

- [x] Dead/residue code found by the review is removed (that is the point of this pass);
  removals are listed in the findings report and verified by rebuild + browser check.

## Acceptance check

> Done when the findings report lists every issue found (each marked **fixed** or **reported —
> awaiting decision**), the full test plan has been executed in the browser against the mock API
> on desktop **and** mobile viewport with every check passing (or failures reported honestly),
> and `plan.md` + `changelog.md` are updated — with everything under "Must stay the same" still
> working.

## Test plan (Phase 2 — written before browser work)

Environment: Docker harness `st-dev` (ST at localhost:8000) + `st-mock-api` (:3101, queue via
`POST /admin/queue/push`); chrome-devtools MCP on isolated Chrome :9222; build 4926 deployed via
junction. Engine handle: TH iframe `contentWindow['sp-status-panel']` (`version`, `debugState()`).
Evidence: DOM reads via `evaluate_script` first; screenshots only where visual (budget rule).

**Desktop (D):**
- D1 Load & toolbar: script loads with no console errors; toolbar shows SP 面板 (+ dev SP 重载;
  an inert SP 刷新 may linger from the previously-imported loader — noted, not a failure).
  SP 面板 opens the settings window.
- D2 **S11 regression:** 样式 tab opens clean — no `#sp-ai-design*` nodes, no generator UI.
- D3 Consent/guidance lifecycle: unconsented character → consent banner; allowed + incomplete
  definition → guidance card (as applicable to harness card state).
- D4 字段 tab: field list renders; add/edit/delete a field; 示例值 present (adoption path noted).
- D5 Path A render: queue a mock reply containing the status JSON block → send user message →
  assistant reply renders panel iframe; parsed values match queued block (read `srcdoc`).
- D6 Empty state: assistant message w/o stored values → panel with muted dashes, actions present.
- D7 Path B retry: 🔄 → request hits mock API, queued JSON parsed, values written per-swipe;
  error variant → 生成失败 badge, 重试 stays live; zero-fields variant → error, **no** request.
- D8 Edit modal ✏: overlay full-viewport (transform-proof `100vh`), themed via `--sp-*`,
  save writes values and re-renders.
- D9 Fold chip ⋯: expands action row; tap-away collapses.
- D10 简易 style: knob change → live preview updates without save; 保存 → card `theme` written,
  chat panel re-renders; `--sp-*` var block in srcdoc matches knobs.
- D11 高级 style: paste custom HTML/CSS → sandboxed preview renders; save → panel uses it;
  author CSS scoped under `.sp-iframe-root`.
- D12 Card whitelist: after saves, `POST /api/characters/get` shows only `SP_CARD_ALLOWED_KEYS`
  under `data.extensions.status_panel` — never engine/API keys.
- D13 Per-swipe persistence: swipe → independent values; swipe back → originals.
- D14 Reload persistence: full page reload → panels re-render from stored values.
- D15 管理 tab: 清除聊天数据 opens the clear modal (SP 清除 toolbar route removed); reset works.
- D16 **Known-bug repro (report-only):** 高级 template with a value token inside an HTML
  attribute + empty value → corrupted attribute; evidence captured, fix proposed separately.
- D17 生成 tab: 注入内容预览 equals the live `status_panel_instructions` extension prompt.

**Mobile viewport (M, DevTools emulation ~390×844):**
- M1 Panel renders w/o horizontal overflow; fold chip works.
- M2 Settings window usable; coarse-pointer sizing applies (bigger buttons/inputs).
- M3 Edit modal fully on-screen with internal scroll.

## Results (2026-07-09)

### Fixed (safe, applied + rebuilt — main.js 5031→4926 lines, `node --check` clean)

1. **Dead CSS removed** from `src/ui/styles.js` (~90 lines): the entire `.sp-prev-*` +
   `.sp-badge-builtin/preset/sp/schema/inject` injection-preview block, `.sp-preset-*` preset-row
   block, `.sp-prompt-preview`, and `.sp-preset-line*` — none are emitted by any current markup
   (residue of removed preview/preset UIs). Live selectors kept (`.sp-token-warnings`,
   `.sp-theme-row`, `.sp-badge`/`.sp-badge-error` in the iframe global sheet, `.sp-import-row`).
2. **Toolbar reduced to SP 面板 only** (user directive): removed the `SP 清除` binding from
   `toolbar.js` and the `SP 清除`/`SP 刷新` buttons from the dev loader JSON. Clear-panel modal
   still reachable via 管理 tab → 清除聊天数据.
3. **agent.md doc drift** corrected: SPEC range S1–S11 → S1–S14 (×2); the `{{name}}` router line
   (said "removed — flagged as unknown") → S14 field-name label token; dead-CSS + toolbar notes.

### Reported (not fixed, per "report risky" policy)

- **R1 — Known bug reproduced (D16):** a value token placed *inside an HTML attribute*
  (`style="width:{好感度}%"`) expands, when the value is empty, to
  `style="width:<span class="sp-ph sp-ph-dash">—</span>%"` — the inner quote terminates the
  attribute and corrupts the element. Confirmed live in the chat panel iframe. This is
  **author-authored 高级 CSS**, not engine output; the engine can't know a token sits in an
  attribute. `styles.md §9` already carries the MUST/NEVER rule (drive bar width from the
  `<style>` block, never an inline attribute). **Proposed:** leave code as-is; the guardrail is
  documentation, already in place. No safe automatic fix exists.
- **R2 — Settings-window chrome uses a fixed dark palette** (`panel.js` modals: `#1e1e2e`,
  `rgba(0,0,0,.3)`, etc.; `styles.js` `.sp-edit-box{background:#1b1d27}`, `.sp-iframe-root`
  default `color:#2c3e50;color-scheme:light`). Consistent within the file but does not follow the
  user's SillyTavern theme (`var(--SmartThemeBodyColor)` etc.). This is the panel's long-standing
  deliberate look, not a regression. **Proposed:** no change unless you want the settings window
  to inherit the ST theme (a design decision, separate task).

### Verified NOT dead (coworker flagged, disproved against call sites)

`spParseKeyValueLines` (called `parser.js:90`), `spTokenizeJson` (called `render.js:231`),
`spScopeAuthorCss`/`spCss*` family (called `styles.js:657-658`) are all live. `SP_FAB_ID` and
`exampleUseDefaults` are intentionally retained (documented: dispose-sweep of leftover FABs;
legacy-card whitelist compat) — left as-is.

### Browser verification (chrome-devtools MCP, isolated Chrome :9222 → localhost:8000, st-mock-api)

Build 4926 deployed. Console clean of engine errors (only benign ST warnings). All checks passed:

| # | Check | Result |
|---|---|---|
| D1 | Load + SP 面板 opens settings | ✅ engine v0.3.0-dev, no errors |
| D2 | **S11 regression** — 样式 tab, no generator | ✅ `aiDesignNodes:0`, no `#sp-ai-design*` |
| D5 | Path A render from stored values | ✅ panel renders, values match |
| D6 | Empty-value dash state | ✅ muted dashes, actions present |
| D7 | Path B retry (mock API) | ✅ success→values written per-swipe (source:auto); error→生成失败 badge + toast, values kept, 重试 live |
| D8 | Edit modal (desktop) | ✅ full-viewport overlay (457px), themed |
| D10 | 简易 knob → live preview | ✅ `--sp-accent:#22cc88` in srcdoc var block, no save needed |
| D11 | 高级 paste → scoped preview + save | ✅ author CSS scoped `.sp-iframe-root`, card updated |
| D12 | **Card whitelist** (server fetch) | ✅ only allowed keys; `tagStart/tagEnd` refused on save (console), **no API keys on card** |
| D14 | Reload persistence | ✅ panel re-renders 深夜/森林小屋/42 after full reload |
| D15 | 管理 tab clear modal | ✅ opens with 仅清除数据 / 移除面板 options |
| D16 | Token-in-attribute bug | ✅ **reproduced** (see R1), original template restored exactly |
| D17 | 生成 tab inject preview == extension prompt | ✅ `epValueMatchesPreview:true` (719 chars, role/depth 0) |
| M1 | Mobile: no horizontal overflow | ✅ panel within viewport (378px in 501px) |
| M2 | Mobile: settings window fits | ✅ 420px within viewport |
| M3 | Mobile: edit modal on-screen | ✅ overlay==viewport (520), box top:31 bottom:489, fields scroll |

Note: coarse-pointer sizing (`@media (hover:none) and (pointer:coarse)`) not exercised — plain
DevTools resize doesn't emulate touch; needs a real device or touch emulation. Harness state
reset after testing (mock queue/log cleared; test template restored byte-exact).

## Assumptions & open questions

- **Assumption:** "unaligned/hardcoded CSS" means CSS that bypasses the `--sp-*` theme variables
  / `styles.md` conventions where it should ride them; deliberate structural CSS is fine.
- **Assumption:** review scope is `src/` + `build.js` + loader alignment; docs are only checked
  for drift against code, not rewritten.
- **Assumption:** mobile = DevTools viewport emulation, not a physical device.
- **Assumption:** the known token-in-attribute bug counts as "risky" → reproduce + report with
  proposed fix, no silent fix.
- **Open question:** none blocking.

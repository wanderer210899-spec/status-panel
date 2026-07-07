# Status Panel — Project Context (v3)

## Purpose

Global TavernHelper **engine** for per-character status panels. Panel definitions live in the character card (`data.extensions.status_panel` via `writeExtensionField`) and travel with exports; engine settings (API keys, consent lists) live in TH global variables (`status_panel_engine`) and never touch cards; per-message values live in `message.data.statusPanel` via `TH.setChatMessages` + `{refresh:'none'}`. Chinese UI, English docs/code.

**Locked product spec: `SPEC.md` (S1–S11).** Read it before touching prompt assembly, the card schema, or the styling model — changes must cite a SPEC ID. Full technical contract: **`architecture.md`**.

## Quick Start

- Build: `node build.js` here → `main.js` (~5200 lines) + `dist/status-panel.{js,json}`. Harness dir is an NTFS junction — rebuild **is** deploy; reload the ST page to load it.
- Runtime entry: `src/index.js` (`initStatusPanel`) — event wiring, bridge init, disposal.
- Never hand-edit `main.js`/`dist/*`. Bundle is a flat IIFE; function declarations hoist, so file order in `build.js` is not a dependency order. Top-level `const`s are initialised in file order at IIFE start, before any panel renders — fine for cross-file references at call time.
- Debug: engine API at `iframe.contentWindow['sp-status-panel']` (TH iframe, NOT top window) — `{version, openPanel, refresh, dispose, debugState()}` (v3 dropped `injectNow`). Panel iframes are sandboxed: inspect `srcdoc` attribute, never `contentDocument`.
- Ship target: `dist/status-panel.json` imports into TH 脚本库 → **全局** tab.

## File:Line Index

| Concern | File | Symbol / Lines |
|---|---|---|
| Engine settings load/save/reset | `src/core/store.js` | `spEngineLoad`/`spEngineSave`/`spEngineReset` (~L195-235; keys trimmed in v3: role/depth/API/renderMode/consent only) |
| Card definition CRUD + **whitelist** | `src/core/store.js` | `SP_CARD_ALLOWED_KEYS` L47, `spFilterCardKeys` ~L160, `spCharDefSave` L173 (filters patch + merged — S11), `spCharDefDelete` ~L190 |
| Consent + lifecycle state | `src/core/store.js` | `spPanelState`/`spPanelEnabled`, `spAllow/Dismiss/DisableCharacter` (~L245-305) |
| Merged config | `src/core/store.js` | `effectiveConfig` ~L312; card template `SP_CHARDEF_TEMPLATE` ~L61 (`retryIncludePrev`; no `regenMode`/`exampleUseDefaults`); `SP_SAMPLE_FIELDS` ~L82 |
| Tag + parsing | `src/core/parser.js` | `spTagPair` L8, `extractStatusFromMessage` ~L87 (JSON then `键:值`) |
| Instruction builder | `src/core/parser.js` | `spBuildFullPromptContent` ~L182 (`opts.forSecondary`), `spBuildFieldConstraintsBlock` ~L144 (name/type/**示例**/description), `spMarkerJsonPlaceholderForFields` ~L105 (output block = `<descriptor>` placeholders, S4) |
| JSON schema | `src/core/schema.js` | `statusFieldsToJsonSchema` L16 |
| Frame deferral (Firefox-safe) | `src/utils/helpers.js` | `spDeferFrames` L54 (top-window rAF + 200ms net), `spMountIframe` L78 — never use this script's own rAF |
| Message-data writes | `src/utils/helpers.js` | `spMergeChatMessageData` L288 (`refresh:'none'` — the invariant) |
| Marker signature (schema-aware) | `src/utils/helpers.js` | `spMarkerSig` ~L374 — includes field names |
| postMessage bridge | `src/utils/helpers.js` | `spInitBridge` L123 (sp-resize / sp-action retry\|edit / sp-state; validates `e.source`; no `settings`) |
| Manual retry gen (**only** generateRaw) | `src/api/generate.js` | `runStatusGeneration` L90 (fields-empty guard, success/error writes), `buildStatusGenerationPrompts` L55 (instructions + prev + msg + schema), `spBuildPrevStatusInject` ~L33 |
| CSS scoper + global sheet | `src/ui/styles.js` | `spScopeAuthorCss` ~L559, `spIframeAuthorStyleText` hoists `@import`, `spIframeBaseCss` L450 (root only), **`SP_IFRAME_GLOBAL_CSS` L468** (all chrome, `--sp-*` vars) |
| Layout generator (简易) | `src/ui/layoutgen.js` | `spGenerateLayoutHtml` L84 (markup + bar calc + `@import` only), `spLayoutTheme` L24 (11 knobs incl. text/btn colours + `buttonsCollapsed`), `spThemeFontStack` L57, `spFontFamiliesFromUrl` |
| Token interpolation + srcdoc | `src/ui/render.js` | `spInterpolateTemplate` L404 (empty→dash, no `{{name}}`), `spBuildIframeSrcdoc` L438 (var block + global sheet + fold-aware `{sp_actions}`), `spBuildThemeVarBlock` L518 |
| Retry / panel mount | `src/ui/render.js` | `spRetry` L556, `renderPanelForMessage` ~L635 |
| Consent banner / guidance card | `src/ui/render.js` | `spSyncConsentBanner` ~L666, `spSyncGuidanceCard` ~L704 |
| Extension-prompt injection | `src/ui/render.js` | `spSyncExtensionPrompt` L784 (always on while enabled+fields; role/depth from engine) |
| Field adoption from first block | `src/ui/render.js` | `spAdoptFieldsFromParsedBlock` ~L878 (adopted values → each field's 示例值; re-renders open settings window) |
| Full refresh + message events | `src/ui/render.js` | `refreshAllAssistantPanels` L809, `spSyncMarkersOnlyForMessage` L1009 (returns true when it wrote) |
| Settings window tabs | `src/ui/panel.js` | `renderPanelContent` ~L126; 字段 `spRenderFieldsTab` ~L497 (示例值, 状态块 preview/copy); `spTemplateTokenWarnings` ~L740; 样式 `spRenderStylesTab` ~L800 + `spBindStylesTab` ~L900 (live theme, `spThemeColorField`, ↺-follow); 生成 `spRenderGenerateTab` ~L1140 + `spBindGenerateTab` ~L1265 (`spGenerateDraftConfig`, `spUpdateInjectPreview`); 管理 `spRenderManageTab`; `openPanel` |
| Edit modal | `src/ui/panel.js` | `spShowEditModal` ~L353 — theme via inline `--sp-*` on the overlay (S6). Overlay MUST size via `height:100vh` not `inset:0` (ST's `transform`+`perspective` on `<html>` makes it the containing block → `inset:0` collapses the overlay to ~0 height and centres the box off-screen). `.sp-em-fields` needs `min-height:0` for internal scroll. |
| Actions HTML / bridge / fold | `src/core/constants.js` | `SP_DEFAULT_ACTIONS_HTML` (重试+编辑 only), `SP_IFRAME_BRIDGE` (fold toggle + tap-away, `⏳ 生成中`) |
| Script toolbar buttons | `src/ui/toolbar.js` | `spBindScriptToolbarButtons`; buttons = SP 面板 / SP 清除 (SP 刷新 removed). Floating FAB removed 2026-07-07 — settings open only via SP 面板 |
| Event wiring | `src/index.js` | `initStatusPanel` (CHARACTER_MESSAGE_RENDERED, MESSAGE_UPDATED/RECEIVED/SWIPED, CHAT_CHANGED, MESSAGE_DELETED) |

## Architecture (modules)

`src/core/` constants · store (3 storage layers) · schema · parser — `src/utils/helpers.js` TH plumbing + bridge — `src/ui/` styles (global + chrome CSS + scoper) · layoutgen · render (pipeline + lifecycle cards) · panel (settings window) · toolbar — `src/api/generate.js` manual-retry generation (only generateRaw) — `src/index.js` init. Details: `architecture.md`.

## Task Router

- **Panel not rendering for a character**
  - Read first: `spPanelState`/`spPanelEnabled` (store.js), `refreshAllAssistantPanels` (render.js)
  - Check in order: card has `data.extensions.status_panel`? avatar key in `allowedCharacters`? fields+template present (else guidance card, not panel)? message has stored values (else empty panel + dashes — v3 never auto-generates)?
- **Values wrong / not persisting**
  - Read first: `spMergeChatMessageData` (helpers.js L265), `spSyncMarkersOnlyForMessage` (render.js)
  - Read values back via `TH.getChatMessages(id).data` — raw `ctx.chat[i].data` does NOT show TH-written data.
  - Stored values are **per-swipe** (`variables[swipe_id]`). `spMarkerSig` includes field names so schema edits re-normalize on next parse — never revert to content-only sigs.
- **Greeting prefill / block-defined schema**
  - Read first: `spAdoptFieldsFromParsedBlock` (render.js ~L878), `spSyncMarkersOnlyForMessage` (~L1009)
  - Chat open parses blocks (no API spend); JSON block + zero fields → fields auto-created with 示例值 (+ default layout if template empty). `键: 值` lines never adopt. (The manual 注入当前消息 button was removed — S8 amend 2026-07-06; block-absent messages get a panel via 重试.)
- **Generation (retry) fails / badge 生成失败**
  - Read first: `runStatusGeneration` (generate.js L90) + `buildStatusGenerationPrompts` (L55)
  - The ONLY generateRaw path, reachable only from 重试 (S1). Zero fields → error, no request (S5). Error stored per message; 重试 stays live. Harness: needs `st-mock-api` up; queue responses via `POST localhost:3101/admin/queue/push`.
- **Instruction not in prompt (Path A)**
  - Read first: `spSyncExtensionPrompt` (render.js L784), `spBuildFullPromptContent` (parser.js L180)
  - Injection is always on while enabled + fields exist (no toggle). Role/depth from engine (`defaultPromptRole`/`defaultPromptInChatDepth`, default depth 0). Verify via `ctx.extensionPrompts` (key `status_panel_instructions`) or the outgoing request body. The 生成-tab 注入内容预览 shows the exact text (S2).
- **Consent / import flow**
  - Read first: `spSyncConsentBanner` (render.js), consent helpers (store.js)
  - Identity is avatar **filename**; export/import round-trip test procedure in changelog.
- **Settings tab bugs**
  - Read first: the specific `spRender*Tab` + its `spBind*Tab` (panel.js, adjacent)
  - Save split rule (S2/S3): engine keys (role/depth/API/renderMode) → `spEngineSave`; card keys (fields/template/theme/tag/preamble/retryIncludePrev) → `spCharDefSave`. `spCharDefSave` filters to `SP_CARD_ALLOWED_KEYS` (S11) — API keys can't reach the card even if mis-routed.
- **Template/token issues**
  - Read first: `spInterpolateTemplate` + `spBuildIframeSrcdoc` (render.js), `spTemplateTokenWarnings` (panel.js)
  - `{name}` empty → dash (never the field example, S5); layoutgen relies on the plain-text dash for `--spg-v:{token}`. `{{name}}` removed — flagged as unknown.
- **Styling / theme / global CSS / web fonts (S6/S7)**
  - Read first: `SP_IFRAME_GLOBAL_CSS` (styles.js L468), `spBuildThemeVarBlock` (render.js L518), `spBindStylesTab` (panel.js L928 — `collectTheme`/`regenSimple`/`spThemeColorField`), `spLayoutTheme` (layoutgen.js)
  - Chrome CSS is global + `--sp-*` var-driven; the 简易 generator emits markup + bar calc only. Colours knobs store `''` = follow accent/default (`data-sp-overridden`); ↺ link clears the override. Preview reads the LIVE theme (`collectTheme()` passed into `spBuildIframeSrcdoc`), not the saved cfg.
  - Web fonts: `@import` must sit in its own `<style>` before reset+global (spBuildIframeSrcdoc splits it); a mid-sheet @import is silently ignored — verify via fonts.gstatic requests, not console.
- **Usually ignore**: `src/core/constants.js` (stable ids — but `SP_DEFAULT_ACTIONS_HTML`/`SP_IFRAME_BRIDGE` changed in v3), `src/ui/styles.js` panel-chrome CSS (dead `.sp-preset-*`/`.sp-prev-*` rules linger, harmless), `build.js` (only when adding a file or changing dist metadata/buttons).

## Working Rules

- **Read `SPEC.md` before touching prompt assembly, the card schema, or the styling model.** Changes must cite a SPEC ID (S1–S11); do not "improve" past a locked decision.
- All user-facing strings Chinese; identifiers/comments/docs English.
- **No auto/fallback generation (S1).** The only `generateRaw` call site is `runStatusGeneration`, reachable only from 重试. Do not add an on-missing/auto path.
- Layer-3 writes only via `spMergeChatMessageData` (`refresh:'none'`). No echo guards exist anymore — do not reintroduce them; fix root causes.
- `SillyTavern.getContext()` fresh at every read; a held ctx goes stale across chat switches.
- **Never call this script's own `requestAnimationFrame`** — the engine runs in TH's
  `display:none` iframe and Firefox never fires rAF in non-rendered documents (panels/preview
  silently never mount). Defer via `spDeferFrames` (top-window rAF + timeout net). rAF inside
  panel-iframe srcdoc (the bridge) is fine — those iframes are visible.
- Engine API keys must never be written to cards — `spCharDefSave` filters to `SP_CARD_ALLOWED_KEYS` (S11). Add a card-level key there when introducing one; never move API keys card-side.
- Panel chrome styling is global + `--sp-*` variables (S6); the 简易 generator must not emit hardcoded chrome CSS.
- Group chats: engine idles (out of scope). No v1/v2 data migrations beyond keeping the `f.value` key name (`exampleUseDefaults` retained in the whitelist but deprecated/ignored).
- Testing: Docker harness + chrome-devtools MCP; engine handle lives in the TH iframe's `contentWindow`, panel iframes are read via `srcdoc`. After a save-triggered refresh, wait ~1.5 s and re-probe before declaring a render failure (old iframe may still be attached).
- Snapshot/restore in probes: stashing state on `window.__x` across `evaluate_script` calls proved unreliable once (2026-07-05 S3 — a def "restore" round-tripped the contaminated post-save state). Prefer resetting through the app's own UI/save pipeline and verify with a fresh server fetch (`POST /api/characters/get`), not just `ctx.characters`.
- Stale-deploy trap: if the bundle can't be copied/served due to a file lock, STOP and report — never test stale code.
- Author-facing docs: `AUTHOR.md`. Session tracking: `plan.md` + `changelog.md` (`### YYYY-MM-DD / Session N`).

# Status Panel — Architecture (v3)

Product decisions are locked in **`SPEC.md`** (IDs S1–S11). This file is the *how*; SPEC
is the *what*. A change to prompt assembly or the card schema must cite a SPEC ID.

## Overview

Status Panel v3 is a TavernHelper **global** engine script. It idles for characters without
a panel definition; for characters that carry one (in the card at
`data.extensions.status_panel`) and are consented, it parses status blocks from assistant
replies, persists values per message/swipe, and renders them in a sandboxed `srcdoc` iframe
under the message. There is **no automatic generation** (S1): a reply without a status block
leaves the panel empty; values are produced only by the reply's own block, the manual 重试
button, or the edit modal.

---

## Storage layers

Three layers, strictly separated. Engine credentials must never reach a card (S11).

### Layer 1 — Engine settings (per user)

TH global variables (`TavernHelper.getVariables/insertOrAssignVariables({type:'global'})`),
key `status_panel_engine`. Read/write via `spEngineLoad()/spEngineSave()`
([store.js](src/core/store.js)); `spEngineReset()` resets everything **except** the consent
lists.

Keys: `apiMode` (`main`|`custom`), `apiOpenaiUrl/Key/Model`, `allowedCharacters[]`,
`dismissedCharacters[]` (both keyed by avatar filename), `defaultPromptRole`,
`defaultPromptInChatDepth`, `renderMode` (`last_only`|`every_message`). (v2's preset-merge,
history-snapshot, chat-history-depth, auto-inject-toggle, and regen-mode keys were removed
in v3.)

### Layer 2 — Panel definition (per character)

Card field `data.extensions.status_panel`, written with
`ctx.writeExtensionField(ctx.characterId, 'status_panel', def)`. Saves server-side and
**exports inside the card PNG**. API: `spCharDefLoad/Save/Delete` ([store.js](src/core/store.js)).

**`spCharDefSave` filters every write to `SP_CARD_ALLOWED_KEYS`** (S11) — the single
enforcement point for "engine settings never touch the card". Shape:
`{ version: 2, fields[], htmlTemplate, css, designMode: 'simple'|'advanced',
theme, tagStart, tagEnd, defaultPromptContent, retryIncludePrev }`
(`exampleUseDefaults` still whitelisted for legacy cards but deprecated/ignored — S4 amend).
`theme` knobs: `accent, radius, textSize, font, headerColor, borderColor, textColor,
btnColor, btnBorderColor, btnTextColor, buttonsCollapsed` (empty colour = follow accent).
Field types: `text`, `number` (min/max), `enum` (options[]); `f.value` is the field's
**示例值** (S4), AI-facing only — never rendered on the panel.

`effectiveConfig()` = base defaults ⊕ engine settings ⊕ card definition.

### Layer 3 — Status values (per message/swipe)

`message.data.statusPanel` written through `spMergeChatMessageData`
([helpers.js](src/utils/helpers.js)) → `TH.setChatMessages([...], { refresh: 'none' })`.
`refresh:'none'` saves (debounced) **without re-emitting `CHARACTER_MESSAGE_RENDERED`** —
this replaced the v1 echo-guard apparatus entirely.

```js
// data.statusPanel
{ values: { 心情: '沉思', 好感度: 61, … },
  source: 'markers' | 'auto' | 'manual' | 'error',
  error?: string }
```

- `markers` — parsed from the reply's status block (badge 来自回复).
- `auto` — produced by the manual 重试 `generateRaw` (badge 已生成).
- `manual` — user edited values via the ✏ edit modal (badge 手动).
- `error` — generation failed; `error` holds the reason. Badge 生成失败, prior values kept,
  重试 always clickable.

NOTE: reading raw `SillyTavern.getContext().chat[i].data` does **not** see this — always read
back through `TH.getChatMessages`.

---

## Lifecycle states

`spPanelState()` derives one of four states from (card def, consent lists); consent identity
is the **avatar filename** (`spCurrentCharKey()`):

| State | Condition | Behavior |
|---|---|---|
| `none` | No definition (or no character / group chat) | Engine idle; only the SP 面板 entry point exists |
| `consent` | Definition present, character in neither list | Chinese consent banner (`spSyncConsentBanner`): 启用 / 暂不 |
| `dismissed` | In `dismissedCharacters` | Idle; re-enable via 管理 tab |
| `enabled` | In `allowedCharacters` | Full pipeline: listeners live, instruction injected, panels rendered |

On every full refresh (`refreshAllAssistantPanels`): sync consent banner, sync guidance card,
sync extension prompt, then render panels for qualifying messages. `spSyncExtensionPrompt()`
publishes the instruction via `ctx.setExtensionPrompt` while enabled **and fields exist**
(no on/off toggle in v3, S2), using engine `defaultPromptRole` and `defaultPromptInChatDepth`
(default depth 0); it clears the slot otherwise — verified present in outgoing
main-generation request bodies.

**Guidance card** (`spSyncGuidanceCard`): when enabled but the definition has no fields or no
template, a Chinese onboarding card appears under `#chat` with buttons to the right tab
(定义字段 → 挑样式, S9). Once fields + layout exist, normal generation fills the panel.

**Chat open = offer, don't spend**: opening a chat never fires an API call. Parsing is *not*
spending: the refresh path lifts author-prefilled status blocks (e.g. in a greeting) into
stored values via the marker-only sync — free and sig-deduped.

**Schema adoption** (`spAdoptFieldsFromParsedBlock`): a JSON block parsed while the definition
has **zero fields** creates the fields from the block's keys (number/text inferred, block
value → the field's 示例值) and, if the template is empty, generates the default 简易 layout —
one pasted block in a greeting yields a working panel. Never runs once any field exists;
`键: 值` lines never adopt. If the settings window is open it re-renders so the 字段 tab shows
the adopted fields immediately.

Group chats: out of scope — engine idles.

---

## Detection + instruction

- `spTagPair(cfg)` ([parser.js](src/core/parser.js)) — resolves the configured tag; default
  HTML comments `<!--status-panel-->…<!--/status-panel-->` (invisible in chat if all else fails).
- `extractStatusFromMessage(text, cfg)` — finds the tag, tries `JSON.parse` first, falls back
  to line-based `键: 值` parsing mapped onto defined field names.
- `spBuildFullPromptContent(cfg, opts)` — Chinese preamble + auto-derived field constraints
  (name, type, range/options, **示例**, description) + output-block template. Consumers: the
  extension-prompt auto-inject (Path A), the 生成-tab preview + 复制 button, and (with
  `forSecondary`) the 重试 prompt. The output block (`spMarkerJsonPlaceholderForFields`) uses
  `<descriptor>` placeholders — type / range / enum options / hint — **not** concrete values,
  so the model fills the current state instead of copying an example (S4 amend 2026-07-06).
  The 示例值 still appears, labelled `示例「X」`, in the field-constraints list.
- Marker transport is stripped from the **displayed** `.mes_text`
  (`spStripMarkersFromDisplayedMessage`); parsing always reads `row.message`.

## Manual retry generation (the only generateRaw)

`runStatusGeneration(messageId)` ([generate.js](src/api/generate.js)) is the **sole**
`generateRaw` call site, reachable **only** from the 重试 action (bridge → `spRetry`). No
auto/fallback path calls it (S1).

1. Guard: zero fields → toast + return, no request (S5).
2. `buildStatusGenerationPrompts` (S3): instructions (role = `defaultPromptRole`) → optional
   `上一条已知状态` line (gated by `retryIncludePrev`) → the target message's prose with its
   status block stripped (assistant turn) → the JSON-schema constraint (user turn). No preset
   merge, no `chat_history` builtin, `max_chat_history:0`.
3. `TH.generateRaw` with `json_schema` (`statusFieldsToJsonSchema`), `custom_api` when
   `apiMode==='custom'`.
4. Success → validate expected keys, normalize (`spNormalizeValuesFromParsed`), write
   `source:'auto'`. A concurrent markers write wins (never overwritten).
5. Failure → toast + write `{values: priorValues, source:'error', error}` — explicit,
   retryable, non-destructive.

`spBroadcastState(messageId, pending)` flips the iframe's 重试 button (shows `⏳ 生成中`,
disabled) tightly around the call — the visible "generation happening" indicator.

---

## Render pipeline

```
message event (CHARACTER_MESSAGE_RENDERED / MESSAGE_RECEIVED / MESSAGE_UPDATED / MESSAGE_SWIPED / MESSAGE_DELETED / CHAT_CHANGED)
  └─ gated by spPanelEnabled()
       ├─ parse markers → spMergeChatMessageData(source:'markers')   (no block → nothing; no auto-gen)
       └─ renderPanelForMessage(messageId)
            ├─ effectiveConfig() + stored status via TH.getChatMessages
            ├─ .sp-block-root (data-sp-message-id) → .sp-block-shell
            └─ spMountIframe(shell, spBuildIframeSrcdoc(cfg, values, meta))
```

### spBuildIframeSrcdoc ([render.js](src/ui/render.js))

1. Pre-escape values (`spEscapeHtml`) → `safeValues`.
2. `spInterpolateTemplate` — `{name}` → live value; empty → muted `—` (a `.sp-ph-dash` span in
   HTML body, plain text inside `<style>` bodies). It **never** falls back to the field's
   example (S5). `{{name}}` default tokens were removed (S4/S10).
3. `{sp_actions}` → 重试 + 编辑 row (`SP_DEFAULT_ACTIONS_HTML`; no 设置, S10); wrapped in a ⋯
   fold when `theme.buttonsCollapsed`. `{sp_badge}` → source badge.
4. `<style>` order (S6): ① hoisted `@import`s in their own element; ② engine sheet =
   reset + **`:root{--sp-*}` var block** (`spBuildThemeVarBlock` from `spLayoutTheme(cfg)`) +
   **`SP_IFRAME_GLOBAL_CSS`**; ③ scoped author CSS (base root + card `css` + embedded `<style>`).
   Author CSS is later and scoped, so it wins on conflict — old cards keep their look.
5. `@import` split is required: an @import preceded by any rule in the same stylesheet is
   silently ignored by the browser (no console error).

`spMountIframe` always removes the previous `iframe.sp-frame` before inserting;
`sandbox="allow-scripts"` only.

### Layout generator (简易 mode)

`spGenerateLayoutHtml(fields, theme)` ([layoutgen.js](src/ui/layoutgen.js)) emits **markup +
per-field bar-calc CSS + optional `@import` only** (S6) — number → `.spg-bar/.spg-fill` with
`--spg-v:{token}` clamp CSS, enum → `.spg-pill`, text → plain row; `{sp_badge}` in the header,
`{sp_actions}` in the footer. All chrome colours/spacing/fonts live in `SP_IFRAME_GLOBAL_CSS`
themed via `--sp-*` vars, so the generated template carries no hardcoded colours. Output is a
normal `htmlTemplate`; the render path doesn't special-case it.

---

## Bridge protocol

Single `message` listener on `chatDoc().defaultView`, bound once by `spInitBridge()`
([helpers.js](src/utils/helpers.js)) before any iframe mounts.

| Direction | Type | Payload | Effect |
|---|---|---|---|
| iframe → host | `sp-resize` | `{height}` | Sets height on the frame matched by `contentWindow === e.source` |
| iframe → host | `sp-action` | `{action: 'retry'\|'edit'}` | Message id from closest `.sp-block-root[data-sp-message-id]` → `spRetry(mid)` / `spShowEditModal(mid)` |
| host → iframe | `sp-state` | `{pending}` | Disables 重试 and swaps label to `⏳ 生成中` while a generation runs |

The in-iframe bridge script also toggles the 按钮折叠 `.sp-actions-fold` on ⋯ click and
collapses it on tap-away. The `settings` action was removed (S10). The source check
(`contentWindow === e.source`) means forged top-window messages are ignored. Preview iframes
carry `data-sp-message-id="-1"`; the `mid < 0` guard blocks retry on previews.

---

## Settings panel (four Chinese tabs)

`openPanel(tab)` ([panel.js](src/ui/panel.js)); opens on 管理 when the current character has no
enabled panel. `renderPanelContent()` dispatches per tab:

| Tab | Contents |
|---|---|
| 字段 | `spRenderFieldsTab` — field cards (name/type/min-max/options/**示例值**/description), 使用示例字段 starter, 状态块 preview/copy (for greeting-paste), save → `spCharDefSave({fields})` |
| 样式 | `spRenderStylesTab` — renderMode; 简易 (live theme knobs S7: accent + radius/size + 6 overridable colours with ↺-follow + 按钮折叠 + font URL) / 高级 (single HTML box, insert-token datalist); token warnings (flags unknown `{tokens}` and any `{{token}}`); live preview via the same `spBuildIframeSrcdoc`. Save: regenerated template + `theme` → card, renderMode → engine |
| 生成 | `spRenderGenerateTab` (S2) — 注入位置 (深度 default 0 + 角色); **read-only 注入内容预览** + 复制; editable 提示词指令 (auto-assembled rules + placeholder block appended after it); 状态块标记; 重试上下文 (`retryIncludePrev`); API mode (main/custom + 测试连接). Save: role/depth/API → engine, instruction/tag/retry-context → card |
| 管理 | `spRenderManageTab` — per-character create/enable/disable/delete, consent list viewer with 移除, tools (clear chat data, engine reset) |

Edit modal: `spShowEditModal` — host-side modal, writes `values` only, preserves `source`.
Themed from the active card's `--sp-*` vars (set inline on the overlay); `.sp-em-fields` uses
`min-height:0` so its scroll engages and the modal never overgrows the viewport.

---

## CSS scoping contract

Author CSS (card `css` + embedded `<style>` blocks) is scoped to `.sp-iframe-root` by
`spScopeAuthorCss` ([styles.js](src/ui/styles.js)). `:root`/`html`/`body`/`:host` →
`.sp-iframe-root`; other selectors prefixed; `@keyframes`/`@font-face` pass through;
`@media`/`@supports`/`@container`/`@layer` recursed. The comma-splitter is paren-depth-aware.
`spIframeBaseCss` sets only `.sp-iframe-root` typography; the themed chrome (`.spg-*`,
`.sp-btn-*`, `.sp-badge`, `.sp-ph`, fold) lives in `SP_IFRAME_GLOBAL_CSS`.

---

## Security model

- iframe `sandbox="allow-scripts"` only — no `allow-same-origin`; `parent.postMessage` is the
  only outbound channel; `contentDocument` is inaccessible.
- Field values HTML-escaped before interpolation (model-output XSS).
- Bridge validates message shape and real iframe source.
- Engine credentials live only in Layer 1; card writes go exclusively through `spCharDefSave`,
  which filters to `SP_CARD_ALLOWED_KEYS` (S11) and warns on stripped keys.

---

## Key invariants

1. All Layer-3 writes go through `spMergeChatMessageData` with `refresh:'none'`.
2. `spInitBridge` before `refreshAllAssistantPanels`; bridge on `chatDoc().defaultView`.
3. `SillyTavern.getContext()` fetched **fresh at each read**.
4. Consent identity = avatar filename; `spEngineReset` preserves consent lists; `spCharDefDelete` removes the character from both lists.
5. **The only `generateRaw` call site is `runStatusGeneration`, reachable only from the 重试 action (S1).** No auto/fallback generation exists — do not reintroduce one.
6. Generation failure writes `source:'error'` and keeps prior values.
7. Marker data wins over a concurrently finishing 重试 generation.
8. `last_only` uses chat-order id (`spLastAssistantMesIdFromChat`), not DOM order.
9. Engine stays silent (no toast spam, zero network) for `none`-state characters.
10. Stored values are **per-swipe**; marker signatures (`spMarkerSig`) include the field-name set, so schema edits invalidate old sigs and stale values self-heal on the next parse.
11. The refresh path parses markers (marker-only sync — no generateRaw); a greeting-embedded block must populate values on plain chat open.
12. **Card writes filter to `SP_CARD_ALLOWED_KEYS` (S11).** Engine keys can never reach a card; add card-level keys to that list when introducing them.
13. **Panel styling is global + variable-driven (S6):** structure/buttons in `SP_IFRAME_GLOBAL_CSS`, colours via `--sp-*` from `spBuildThemeVarBlock`. The 简易 generator emits no hardcoded chrome CSS.

---

## Manual test matrix

Legacy v2 rows (T1–T13) verified 2026-07-04/05. v3 rows below verified 2026-07-06 (Docker
harness + chrome-devtools MCP).

| # | Scenario |
|---|---|
| T1 | Invisibility — definition-less character: no panel DOM, no engine network calls |
| T3 | Marker path — tag+JSON and tag+`键:值` both parse (badge 来自回复) |
| T7 | Persistence — values survive reload + swipes; definition survives cleared localStorage |
| T8 | Round-trip — export PNG → import → consent → 启用 → identical panel; PNG has definition, no API keys |
| T10 | Sandbox/XSS — escaped model output, `allow-scripts` only |
| T11 | Greeting prefill — block in greeting populates values on plain chat open |
| T13 | Adoption — zero fields + JSON block → fields created with 示例值, layout generated |
| V1 (S1/S5) | No block + new reply → zero generation requests, panel empty with actions; 重试 with fields → one minimal request; 重试 with 0 fields → error, no request |
| V2 (S2) | Preview box == injected extension-prompt text; output block uses `<descriptor>` placeholders (S4 amend); depth 0 + chosen role in outgoing body; edits live-update preview |
| V3 (S6/S7) | Colour/font knob → live preview; saved card `theme` correct server-side; template has no `.sp-btn` chrome CSS; 按钮折叠 chip expands/collapses; edit modal (✏) matches theme + scrolls when tall |
| V4 (S11) | `spCharDefSave({apiOpenaiKey:'x'})` → key stripped + warning; card def clean server-side |
| V5 (S8/S10) | SP 刷新 gone; 注入当前消息 gone (S8 amend); panel shows only 重试 + 编辑 (no ⚙); numeric field inputs themed (not white) |

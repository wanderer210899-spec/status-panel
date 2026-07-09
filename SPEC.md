# Status Panel — Locked Spec (v3)

This file is the **drift anchor**. It records product decisions the user locked via
questionnaire on 2026-07-06. Every change to prompt assembly, the field/card schema,
or the styling model must trace to one of these IDs. If a change contradicts an ID,
stop and get the user's confirmation — do not "improve" past the spec.

> Rule: a PR/commit touching **prompt assembly** or the **card schema** must cite a
> SPEC ID in its message. Reviewers reject silent violations.

> **Amendments — 2026-07-06 (Session 2):** S4 — the auto-assembled output block now uses
> `<descriptor>` placeholders instead of concrete example values (best-practice prompting);
> the `示例块使用字段示例值` toggle and `exampleUseDefaults` key are retired. S8 — the manual
> **注入当前消息** button was removed as redundant. S9 — onboarding steps updated to match.
>
> **Amendment — 2026-07-07:** S10 — the floating **SP FAB** button is removed entirely
> (user request). Settings now open only via TavernHelper's own **SP 面板** toolbar button
> (or the guidance card's 字段设置/样式设置 buttons while a definition is incomplete).
> `ensureToolbarFab` and its drag logic are deleted from `src/ui/toolbar.js`; `SP_FAB_ID`
> is kept only as a dispose-time cleanup target for a leftover element from a
> previously-loaded build.
>
> **Amendment — 2026-07-08 (Session 7):** S12 — a **second** `generateRaw` path is legalized
> for **theme/design** generation (the AI Theme Generator in the 样式 tab), distinct from the
> value-generation path of S1. It produces panel **HTML**, never status values; it never writes
> to message data, cards, or fields; it is user-triggered (one click) and spends credits like
> 重试. This narrows S1's "two generation paths only" to "two **value**-generation paths only"
> — see S12.
>
> **Amendment — 2026-07-08 (Session 8):** S13 — the **custom status-block tag override**
> (`tagStart`/`tagEnd`) is **removed**. Status blocks are now **always** delimited by the default
> invisible markers `MARKER_START` / `MARKER_END`. The 生成-tab 状态块标记 inputs, their wiring,
> the `tagStart`/`tagEnd` card keys (whitelist + templates), and the `spTagPair` cfg override are
> deleted. Legacy cards that set custom tags will stop parsing their block (accepted). Also (no
> SPEC bearing): the 高级-editor 「插入 {name}（实时值）」 helper is removed — the `{name}` token
> system is unchanged. S12 prompt tightened — design requests now send a simple `{key}` token list
> (no field examples/ranges) + one one-shot example.
>
> **Amendment — 2026-07-08 (Session 9):** S14 — a **field-name label token** `{{name}}` is added,
> rendering the field's **name** (a static label), complementary to `{name}` which renders its live
> **value**. This intentionally **reverses** the old "`{{name}}` is invalid / not substituted" rule
> (S4/S10 removed the *value*-bearing `{{name}}` default tokens) — the double-brace form now has a
> new, distinct meaning (label, not value). Also (no SPEC bearing): the S12 theme prompt prose is
> now authored in the editable file `src/api/theme-prompt.md` (inlined at build), so its exact
> wording/example is no longer pinned by SPEC — only the S12 *behavior* is.
>
> **Amendment — 2026-07-08 (Session 11): S12 RETIRED.** The in-app **AI Theme Generator** (the
> second, design/HTML `generateRaw` path added in S12) is **removed** — in practice it produced
> poor panels from the in-chat model. `runThemeDesignGeneration`, `spBuildThemeDesignSystemPrompt`,
> `spStopThemeDesignGeneration`, `spStripCodeFences`, the `#sp-ai-design*` UI + its wiring +
> `spThemeDesignDrafts`, and `theme-prompt.md` (+ its `build.js` inlining) are all deleted.
> `runStatusGeneration` (value gen, S1) is once again the **only** `generateRaw` site. Panel
> styling remains via **简易** (deterministic generator), **高级** (manual HTML/CSS paste), and the
> **external-model prompt** (copy 复制状态块 → run in a full chat model → paste; `AUTHOR.md` §3).
> S13's design-gen/cancel clauses are retired with S12; **S13's tag-override removal still stands.**

---

## S1 — Two generation paths only
Path A: normal ST generation, with the status instructions + JSON status block injected
via the extension-prompt channel. Path B: the manual **🔄 重试** button on the panel.
**There is no automatic/fallback generation.** A reply without a status block leaves the
panel empty — the engine never spends credits on its own. (Removed: `regenMode`,
auto `generateRaw`-on-missing, `spInjectAssistantPanelsNow`, SP 刷新 button.)

## S2 — Injection = two boxes, one place
The 生成 tab shows exactly:
- a **read-only preview** of the assembled instruction (per field: key, type, description,
  example) — the exact Path-A text;
- an **editable prompting-instructions box** (`defaultPromptContent`, card-level, exports).

Both inject together, in-chat, at **深度 0 by default**, with a **角色** selector
(system/user/assistant). There is no 自动注入 toggle — injection is on while the panel is
enabled and has fields. A 复制 button lets authors also place it manually.

## S3 — Retry context is minimal
The 重试 request contains only: the instructions + the JSON status block spec + the last
AI message (status block stripped). A per-card toggle `retryIncludePrev` optionally adds
one line of the previous message's known values for numeric continuity. **API modes
(main / custom OpenAI-compatible) are untouched.** (Removed: preset-prompt pulling,
history snapshots, chat-history depth.)

## S4 — 示例值, not 默认值  · *(amended 2026-07-06)*
A field is 名称 + 类型 + 描述 + **示例值**. The 示例值 appears ONLY inside the AI-facing
instruction, in the **field-rules list**, clearly labelled `示例「X」`; the panel never renders
it as a value. The auto-assembled **output block** (`spMarkerJsonPlaceholderForFields`) shows
`<descriptor>` placeholders — type / range / enum options / hint — **not** concrete values,
so the model fills the current state instead of copying an example. A JSON block in a greeting
still populates that message's values by parsing, and its values are adopted as each field's
示例值. (Storage key remains `f.value` — no card migration. The `示例块使用字段示例值` toggle
and `exampleUseDefaults` key are **deprecated & ignored**; the key stays whitelisted so legacy
cards don't trip strip-warnings.)

## S5 — Panel renders empty on no/bad data
Missing, broken, incomplete, or empty values → the panel renders with muted dash
placeholders and the ✏ 编辑 / 🔄 重试 actions visible. No 默认值 placeholders, no example
leakage. 重试 with **zero fields defined** shows an error and fires no request.

## S6 — Global CSS
One engine-owned stylesheet (`SP_IFRAME_GLOBAL_CSS`) defines panel structure and button
alignment for ALL panels. Per-card theme = CSS-variable **values** (`--sp-*`) set in
`spBuildIframeSrcdoc`, exported with the card. The 简易 generator emits markup + per-field
bar widths only — never hardcoded chrome colours. Author (高级) CSS is scoped and layered
after the global sheet, so it still wins on conflict and old cards keep working.

## S7 — Theme knobs (简易)
主色 (master — prefills the other colours until each is individually overridden; colours
bars/pills) · 标题色 · 状态栏边框色 · 圆角 · 字号 · 主文字颜色 · 按钮颜色 · 按钮边框色 ·
按钮文字颜色 · 按钮折叠 (⋯ chip expands the action row, tap-away collapses) · 字体链接
(Google Fonts css2 URL). Overridable colours store `''` = follow; a ↺ link restores follow.
高级模式 keeps equal billing (full HTML paste, same preview/save pipeline).

## S8 — Blockless messages (no manual inject)  · *(amended 2026-07-06)*
A reply containing a JSON status block auto-parses and renders on arrival (Path A / chat
open); a reply with no block leaves no panel — use **🔄 重试** to generate one. The manual
**注入当前消息** button was **removed as redundant**: it duplicated the auto-parse path, and
its only unique use — stamping an empty panel onto a blockless message for hand-editing — is
already served by 重试. Greeting-paste + auto-adopt (字段 tab 复制状态块) covers blockless starts.

## S9 — Onboarding = better guidance card  · *(amended 2026-07-06)*
No wizard. The in-chat guidance card gives clear copy + direct buttons to the real steps:
定义字段 → 挑样式（生成/粘贴排版）. Once fields + layout exist, normal generation fills the
panel — there is no manual inject step.

## S10 — Cleanup  · *(amended 2026-07-07)*
Removed: SP 刷新 / 立即注入; the "accepts `<statusblock>` etc." conversion copy;
`{{name}}` default tokens; the **⚙ 设置** button from `{sp_actions}` — **sp actions =
重试 + 编辑 only**; and the floating **SP FAB** button — settings open only via the
**SP 面板** TavernHelper toolbar button.

## S11 — Card key whitelist (enforced)
`spCharDefSave` filters every write to `SP_CARD_ALLOWED_KEYS`; engine settings (API keys,
consent lists) can never reach an exported card. Adding a card-level field requires adding
its key to that list. This is the single enforcement point for the "engine settings never
touch the card" invariant.

## S12 — AI Theme Generator (design generation path)  · *(added 2026-07-08; **RETIRED / removed 2026-07-08 Session 11** — see amendment log above. Kept for history.)*
A second, user-triggered `generateRaw` path that generates the panel's **look** (advanced
HTML+CSS), separate from the value-generation of S1/S3. Change request:
`changes/2026-07-08-ai-theme-generator.md`.

- **Scope of the exception to S1.** S1 forbids *automatic/fallback value* generation; it does
  **not** forbid a *user-clicked design* request. This path is one click from the 样式 tab's 高级
  (advanced) section, produces **HTML text only**, and **never** parses/writes status values,
  message data, cards, or fields. `runStatusGeneration` (value path) stays the ONLY site that
  writes `SP_CHAT_STATUS_KEY`.
- **Injected knowledge (request context).** Each design request carries: the panel-HTML contract
  (full `.html` file; `{fieldKey}` = live value token; required markers `{sp_actions}`,
  `{sp_badge}`; `.sp-iframe-root` wrapper; the `--sp-*` theme variables) **and** the current field
  rules (`spBuildFieldConstraintsBlock`), so the model knows the key names and must keep a
  `{token}` for each field. Value filling in chat (Path A / 重试) is unchanged and still works
  because the generated HTML preserves the tokens.
- **Conversation & storage.** A back-and-forth mini-chat, **in-memory only**, per-character,
  **never** persisted to the card, disk, or exports. Survives closing the settings window;
  cleared on **Keep** or **Discard** (and on page reload / dispose). Only the final Kept HTML is
  saved — as ordinary `htmlTemplate` (no new card key; S11 unchanged).
- **Keep = apply + save (no data loss).** The generator's **保留并保存 / Keep & Save** applies the
  design into the 高级 textarea, sets `designMode:'advanced'`, and persists via the existing
  `spCharDefSave` pipeline in one action — the author never needs the separate 保存 button, and an
  un-Kept draft is lost only by explicit **Discard** or a reload. Reuse of a saved design is plain
  copy-paste from the 高级 box back into the generator.
- **API.** Same `custom_api` selection and generateRaw serializer as 重试 (S3); no new API settings.
  Freeform text reply (no `json_schema`); markdown code fences are stripped.
- **Prompt shape (amended S13, Session 8).** The design system prompt is **style-only**: how to
  build the panel HTML template, a **simple list of the available `{key}` tokens** (field key names
  only — NO examples/ranges/hints) plus the required `{sp_actions}`/`{sp_badge}` markers, and **one**
  one-shot example template. It does NOT reuse the value-generation field-rules block.
- **Cancellable (amended S13, Session 8).** An in-flight design request can be aborted by the author
  (click 生成中): a per-request `generation_id` + `TH.stopGenerationById`, with a client-side stale
  guard so a late reply is ignored. Nothing is applied on cancel.

## S13 — No custom status-block tags  · *(added 2026-07-08)*
Status blocks are ALWAYS delimited by the default invisible markers `MARKER_START`
(`<!--status-panel-->`) / `MARKER_END` (`<!--/status-panel-->`). The former per-card `tagStart` /
`tagEnd` override and its 生成-tab UI are removed (author simplification). `spTagPair` takes no config
and returns the constants; `tagStart`/`tagEnd` are dropped from `SP_CARD_ALLOWED_KEYS`,
`SP_CHARDEF_TEMPLATE`, and `SP_CONFIG_BASE`. Change request:
`changes/2026-07-08-simplify-remove-notation-config.md`.

## S14 — Field-name label token `{{name}}`  · *(added 2026-07-08)*
A panel template (author 高级 HTML or AI-generated) can reference each field two ways:

- **`{{name}}`** → the field's **name**, rendered as a static text label (HTML-escaped). Always
  present — it is not data, so it never shows the empty-value dash.
- **`{name}`** → the field's **live value** (S5 rules: empty/missing → muted dash placeholder).

This makes rows easy to write — `{{心情}}：{心情}` renders as `心情：开心` — and lets the AI Theme
Generator place a label and its value straight from the token list without inventing label text.

Substitution (`spInterpolateTemplate`, render.js) runs the **label pass first** (all `{{name}}`),
then the **value pass** (`{name}`), so a `{{name}}` is fully consumed and never leaves stray braces
around a value. There is no separate display-label field — a field's `name` is both its key and its
label. This reverses the pre-v3 stance that `{{name}}` is invalid; the double-brace form now means
*label*, distinct from the removed value-bearing default tokens (S4/S10). Change request:
`changes/2026-07-08-field-name-label-token.md`.

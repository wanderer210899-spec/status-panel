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

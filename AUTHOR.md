# Status Panel — Author Guide (v2)

How to give a character a status panel, style it, and control how the AI populates it. Everything you configure here is saved **into the character card** (`data.extensions.status_panel`) and travels with card exports — users who import your card get a consent prompt (启用 / 暂不) and then your exact panel.

---

## How the panel gets filled (author view)

There are **two generation paths**, both visible — the engine never spends API credits on its own:

| Path | When | Result |
|------|------|--------|
| **A — status block in the reply** | The reply contains your tag (default `<!--status-panel-->…<!--/status-panel-->`) with JSON **or** `键: 值` lines inside. The instructions asking for it are auto-injected into every generation while the panel is enabled. | Parsed and stored with `source:'markers'`, badge 来自回复 |
| **B — manual 重试** | User clicks 🔄 重试 on the panel | One schema-constrained `generateRaw` (with a "生成中" indicator); `source:'auto'`, badge 已生成 |
| **Manual edit** | User clicks ✏ 编辑 on the panel | `source:'manual'`, badge 手动 |

A reply **without** a status block leaves the panel empty (dashes + actions) — there is no automatic fallback generation. A failed 重试 stores an explicit error (`source:'error'`, badge 生成失败 with the reason) — prior values are kept and 重试 stays clickable. The panel never silently invents data.

The renderer reads only the stored values — it never re-parses message text at render time, and it never displays a field's 示例值 as if it were real data.

---

## Writing a status block manually

Paste this anywhere in an assistant message (including the greeting):

```
<!--status-panel-->{"心情":"平静","好感度":50}<!--/status-panel-->
```

or the line form:

```
<!--status-panel-->
心情: 平静
好感度: 50
<!--/status-panel-->
```

Rules:
- Field names must match the 字段 tab definitions (latin keys are matched case-insensitively; values are trimmed).
- The tag is configurable in the 生成 tab (状态块标记). Default HTML comments are invisible in chat even if parsing fails.
- After you edit-save a message, the panel re-parses and updates without any regeneration.
- The tag transport text is stripped from the displayed message; the raw message still contains it.

### Prefilling a chat (greetings)

Paste a JSON block into the character's greeting (any swipe) and the panel picks it
up **when the chat is opened** — no generation event needed. This is the intended
path for shipping a card whose story starts from known values.

Two conveniences make this a one-step workflow:

- **Schema adoption** — if the panel is enabled but you haven't defined any fields
  yet, the first JSON block parsed **creates the field definitions for you**: one
  field per key (numbers become number fields, everything else text; the block value
  becomes the field's **示例值**, which then appears — labelled 示例「X」 — in the injected
  field-rules list). If the template is also empty, the default 简易 layout is generated
  at the same time, so a single pasted block yields a complete working panel. Adoption
  never runs once any field exists — it cannot clobber a hand-built schema. (Only the
  JSON form triggers adoption; `键: 值` lines need existing fields to map onto.)
- **复制状态块** — the 字段 tab has 显示状态块 / 复制状态块 buttons that build a block from
  your current fields and their 示例值 (using your configured tag), ready to paste into a
  greeting. Opening the chat then adopts it automatically — there is no separate "inject"
  button; a reply with no block gets its panel via 🔄 重试.

Editing fields after a block was already parsed is safe: stored values are
re-derived against the new schema on the next chat open or swipe.

---

## Instructing the main AI

**You normally do nothing.** While a panel is enabled and has fields, the engine
auto-injects a Chinese instruction into every main generation via SillyTavern's
extension-prompt channel: your prompting text + field rules (derived live from the
字段 tab: name, type, description, example) + an output-block template. Change a field → the
instruction updates itself. There is no on/off toggle.

The 生成 tab shows this exactly:
- a **read-only 注入内容预览** — the precise text that is injected;
- an **editable 提示词指令 box** — your wording, saved into the card so importers get it;
- **注入位置**: 深度 (default **0** = bottom of the assembled prompt, maximum impact) and
  **角色** (system / user / assistant).

For manual placement (preset, lorebook, system prompt) click **复制** and paste it
wherever — just avoid duplicating the auto-injection.

**Examples vs. the output block.** Your fields' 示例值 appear only in the field-rules list,
clearly labelled 示例「X」. The output block the model must produce is a **template with
`<…>` placeholders** (type / range / enum options / your description), not concrete values —
so the model fills the *current* state instead of copying the example. You only write the
opening instruction; the rules and the output block are appended and kept in sync for you.

The instruction looks like:

```
角色状态追踪 — …

字段规则 — 键名必须与下列名称完全一致，值必须满足对应约束：
  • 「心情」（文本，示例「平静」） — 当前情绪
  • 「好感度」（数字，范围 0–100（含两端），示例 50） — 对用户的好感
…
在正文全部结束后…把每个 <…> 占位符替换为当前时刻的真实值（键名保持不变，数值不加引号）：
<!--status-panel-->{"心情":"<当前情绪>","好感度":<0–100 的数字>}<!--/status-panel-->
```

Never hand-edit the constraint lines or the output block — they are always derived from the
current fields.

---

## Styling the panel

Open **SP 面板 → 样式**. Two design modes:

### Global look, per-card skin

One **engine-owned stylesheet** defines panel structure and button alignment for *every*
panel; a per-card theme supplies only colours/radius/font as CSS variables (exported with
the card). So buttons stay aligned everywhere and there's no per-card layout CSS to
maintain. 高级 templates get the same aligned buttons/badge for free; their own CSS still
wins on conflict.

### 简易模式 (recommended start)

Theme-driven and **live**: changing any knob instantly regenerates the layout into the
preview, and 保存到角色卡 regenerates once more from your current fields + knobs before
writing — the saved template (markup only, exported with the card) can never lag behind
what the knobs show. Numbers render as progress bars, enums as pills, text as rows. Switch
to 高级模式 anytime to hand-edit the generated markup; 简易 and 高级 share the same
preview/save pipeline.

Theme knobs:

| Knob | Effect |
|------|--------|
| 主色 | Master accent: bars, pills; prefills every colour knob below until you override it |
| 圆角 / 字号 | Card corner radius, base text size |
| 标题色 / 状态栏边框色 | Follow 主色 until edited; the ↺ link restores follow |
| 主文字颜色 | Body text colour |
| 按钮颜色 / 按钮边框色 / 按钮文字颜色 | Fill, border, and text of the 重试/编辑 buttons |
| 按钮折叠 | 是 = hide the actions behind a small **⋯** chip; tap it to expand, tap away to collapse |
| 字体链接 | Paste a **Google Fonts css2 URL** (datalist offers 思源宋体/思源黑体/霞鹜文楷/毛笔楷书/小薇 presets) — `@import`ed with its families used; a plain font-family name also works. Empty = system stack |

An overridable colour stores `''` (= follow) until you edit it; the ↺ next to it clears
your override so it tracks the accent/default again. 高级 templates may use
`@import url(...)` for web fonts — the engine hoists imports so they stay valid.

### 高级模式

One textarea. Paste a complete HTML document or fragment — wrappers (`<!DOCTYPE>`, `<html>`, `<head>`, `<body>`) are stripped, `<style>` blocks are extracted and scoped, `<script>` runs inside the iframe sandbox. Live preview updates as you type; unknown `{tokens}` are flagged in a warning box (CSS braces are not false-positived).

### Tokens

| Token | What you get |
|-------|-------------|
| `{name}` | Live value from the stored status, HTML-escaped. Empty → muted `—` placeholder (plain text when used inside a `<style>` block, e.g. `--v:{好感度}`). It never falls back to the field's example |
| `{sp_actions}` | 重试 + 编辑 button row (设置 was removed — open settings via the SP 面板 button) |
| `{sp_badge}` | Source pill: 来自回复 / 已生成 / 手动 / 生成失败 |

`name` must exactly match a field name; typos render literally as `{whatever}` and show up in the token warnings box. `{{name}}` default tokens were removed in v3 — they now render literally and are flagged as unknown.

### iframe scoping

Templates render in a `sandbox="allow-scripts"` iframe — SillyTavern theme CSS cannot reach in, your CSS cannot leak out. Scoping is automatic: `:root`/`html`/`body` → `.sp-iframe-root`, other selectors prefixed, `@keyframes`/`@font-face` pass through, `@media`/`@supports`/`@layer` recursed. Design for ≤ 380 px width.

### Minimal example

Fields: `mood`, `location`, `inner_thoughts`

```html
<div class="my-panel">
  <div class="my-card"><div class="my-label">MOOD</div><div class="my-value">{mood}</div></div>
  <div class="my-card"><div class="my-label">WHERE</div><div class="my-value">{location}</div></div>
  <div class="my-card my-wide"><div class="my-label">THOUGHTS</div><div class="my-value">{inner_thoughts}</div></div>
  <footer class="my-footer">{sp_badge}{sp_actions}</footer>
</div>
<style>
.my-panel { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; padding: 8px; }
.my-card { border: 1px solid rgba(255,255,255,.15); border-radius: 10px; padding: 10px 12px; background: rgba(0,0,0,.25); }
.my-wide { grid-column: 1 / -1; }
.my-label { font-size: 10px; letter-spacing: .08em; opacity: .6; text-transform: uppercase; margin-bottom: 4px; }
.my-value { font-size: 13px; line-height: 1.4; }
.my-footer { grid-column: 1 / -1; display: flex; align-items: center; justify-content: flex-end; gap: 10px; padding-top: 8px; }
</style>
```

---

## The 重试 / 编辑 buttons

`{sp_actions}` expands to (settings was removed — open the settings window via TavernHelper's
own **SP 面板** toolbar button):

```html
<div class="sp-actions-wrap">
  <button type="button" class="sp-btn-retry" data-sp-action="retry" data-sp-label="🔄 重试">🔄 重试</button>
  <button type="button" class="sp-btn-edit"  data-sp-action="edit"  data-sp-label="✏ 编辑">✏ 编辑</button>
</div>
```

| Action | Handler |
|--------|---------|
| `retry` | Manual generation for this message; updates stored values (works from any state, including 生成失败). Errors if no fields are defined |
| `edit` | Host-side modal: per-field inputs (`textarea` / number with min-max / enum select). Save writes `values` only and sets 手动 |

During a generation the 重试 button disables and shows `⏳ 生成中`; the label restores from `data-sp-label` afterwards. With 按钮折叠 on, both buttons hide behind a ⋯ chip.

### Styling the buttons and badge

Buttons/badge are themed globally via CSS variables — the 简易 按钮颜色/按钮边框色/按钮文字颜色
knobs set them. To override in a 高级 template, target the classes directly:

```css
.sp-btn-retry, .sp-btn-edit {
  all: unset; cursor: pointer;
  padding: 4px 14px; border-radius: 999px;
  background: #5c6bc0; color: #fff;
  font: 600 12px/1.4 system-ui, sans-serif;
}
.sp-btn-retry:hover, .sp-btn-edit:hover { filter: brightness(1.15); }
.sp-btn-edit { display: none; }               /* hide manual editing if you prefer */
.sp-btn-retry:disabled { opacity: .4; cursor: not-allowed; }
.sp-badge { background: rgba(100,200,100,.15); border-color: rgba(100,200,100,.4); color: #4caf50; font-size: 9px; }
```

### Built-in classes inside the iframe

| Class | What it is |
|-------|-----------|
| `.sp-iframe-root` | Root wrapper for all template markup |
| `.sp-actions-wrap`, `.sp-btn-retry/-edit` | Action row and buttons |
| `.sp-badge` | Source pill |
| `.sp-ph`, `.sp-ph-dash` | Muted placeholder for empty `{field}` |
| `.spg-*` (`spg-card`, `spg-row`, `spg-bar`, `spg-fill`, `spg-pill`, …) | Classes emitted by the 简易 layout generator |

Light-DOM chrome (`.sp-block-root`, `.sp-block-shell`, consent/guidance cards) is engine-owned and not styleable from the template.

---

## Porting an existing HTML panel

1. 字段 tab: define your fields (names become tokens). Save.
2. Replace placeholder slots (`$1`, `{{slot}}`, …) with `{field_name}` tokens.
3. Add `{sp_actions}` (usually in a footer) and optionally `{sp_badge}`.
4. 样式 tab → 高级模式: paste the whole HTML file. Check the token-warning box for typos.
5. Save — live preview and chat render use the identical pipeline.

---

## Generating a custom skin with an AI prompt

You don't have to hand-write CSS. Copy your **复制状态块** JSON (字段 tab) and paste it —
plus a one-line description of the look you want — into the prompt below, run it in any
chat model (Claude, ChatGPT, etc.), and paste the model's output straight into 样式 →
高级模式.

A plain-language version of the same reference table (for authors who just want to look
something up, no AI involved) is in **`指南.md`**.

```
You are writing a template for a "Status Panel" widget that renders inside a sandboxed,
narrow (≤380px wide) HTML iframe embedded in a chat message. Output ONE fenced code block
containing an HTML fragment with an inline <style> block — nothing else, no explanation
before or after. Do not include <!DOCTYPE>, <html>, <head>, or <body> tags.

INPUT — my status block (field name → current example value):
<PASTE YOUR 复制状态块 JSON HERE, e.g. {"心情":"平静","好感度":50}>

For each field, here is how I want it displayed (delete/edit — the JSON alone has no min/max):
<e.g. 好感度: number 0-100, progress bar. 心情: short text, pill. 内心想法: long text, paragraph.>

STYLE BRIEF: <e.g. "dark fantasy, parchment and wax-seal accents, warm amber text" or
"cute pastel, rounded corners, soft shadows">

STRUCTURE (mechanical, follow exactly):
- One token `{exact_key_name}` per field key above, byte-for-byte, no extra/renamed fields, no `{{double}}` braces.
- Include `{sp_actions}` once and `{sp_badge}` once, usually together in a footer.
- Plain selectors only — no manual `.sp-iframe-root`/`:root` prefixing, one `<style>` block.
- Target ~320-380px width — no `100vw`/`100vh`, no fixed/absolute full-page positioning.
- Any `@import url(...)` web font must be the first line of the `<style>` block.

STYLE REFERENCE — declare CSS for every row that applies to your markup:

| Target | Set these properties |
|---|---|
| `sp.panel` — whole panel; write the selector as `body`, `:root`, or `.sp-iframe-root` | `background`, `color`, `font-family`, `font-size`, `padding`, `border-radius`, `border` — no default background exists, you must declare one |
| each `{field}` token's row/element | `color`, `font-size`, `font-weight`, spacing |
| `.sp-ph`, `.sp-ph-dash` — empty-value placeholder | `color`, `opacity`, `font-style` |
| `.sp-actions-wrap` — row holding the two buttons | `display`, `gap`, `justify-content` |
| `.sp-btn-retry`, `.sp-btn-edit` — the two buttons | `background`, `border`, `color`, `border-radius`, `padding`, `font` |
| `.sp-btn-retry:hover`, `.sp-btn-edit:hover` | `background`/`filter` change |
| `.sp-btn-retry:disabled` | `opacity`, `cursor` |
| `.sp-badge` — source-status pill | `background`, `border`, `color`, `border-radius`, `font-size`, `padding` |
| `.sp-badge-error` — failure variant of the badge | `background`, `border`, `color` |
| `--sp-accent` (optional var) | any color, default `#7c9cff` |
| `--sp-radius` (optional var) | any length, default `12px` |
| `--sp-text-size` (optional var) | any length, default `13px` |
| `--sp-text-color` (optional var) | any color, default `rgba(255,255,255,.92)` |
| `--sp-title-color` (optional var) | any color, default follows `--sp-accent` |
| `--sp-border-color` (optional var) | any color, default `--sp-accent` at 42% |
| `--sp-btn-color` / `--sp-btn-border-color` / `--sp-btn-text-color` (optional vars) | any colors, default derived from `--sp-accent` |
| `--sp-font` (optional var) | any font stack, default system UI |

Optional vars only apply where you write `var(--name)` yourself — hard-coded colors work
just as well. Now produce the complete HTML+CSS block.
```

**Why the JSON alone isn't quite enough:** 复制状态块 only gives you *names and one example
value* — it can't tell the model that 好感度 is a 0–100 bar rather than a plain number. Fill
in the per-field display list before sending; skipping it just means the model guesses
(usually "render as text"), it won't ask.

After pasting the result into 高级模式, check the token-warning box (below the textarea) for
`{unmatched}` tokens — a common one is the model quoting a key with the wrong case or with
extra spaces copied from a `示例「X」` label instead of the raw JSON key. If the panel looks
"washed out" or unreadable against the chat background, `sp.panel` (the root) was left
without a `background` — add one.

---

## Troubleshooting

**Token renders literally as `{location}`** — not a defined field name; the 样式 tab warning box lists such tokens.

**CSS doesn't apply** — inspect the panel iframe's `srcdoc` attribute (its document is sandbox-inaccessible); your rules appear scoped under `.sp-iframe-root`.

**Badge shows 生成失败** — the secondary generation failed; the reason is shown on the panel. Fix connectivity (生成 tab → API → 测试连接) and click 重试. Prior values are never wiped by a failure.

**Panel doesn't appear at all** — check 管理 tab state: the character needs a definition **and** 启用 consent. In 简易/高级 without fields or template, the green guidance card walks the user through setup.

**No status block in replies** — the instruction injects automatically while the panel is enabled and has fields; check the 生成 tab's 注入内容预览 to see the exact injected text, and the outgoing prompt (prompt inspector) to confirm it landed. If you placed it manually instead, make sure it's actually in the preset/lorebook.

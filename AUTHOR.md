# Status Panel — Guide

A live status card under each AI reply — mood, location, stats — defined in the character card and shared whenever you export it.

![A styled status panel under a chat message](images/panel-in-chat.png)

> 中文版：[指南.md](指南.md)

---

## 1. Set it up

Open TavernHelper's script toolbar and tap **SP 面板**.

![Fields tab](images/settings-fields.png)

- **字段 (Fields)** — add each field: a name, a type (text, number, or enum), and an example value. Save.
- **生成 (Generate)** — the AI is automatically told to output these values in every reply. Nothing to switch on.
- **管理 (Manage)** — enable, disable, or remove the panel per character.

![Generate tab](images/settings-generate.png)

Shortcut: **复制状态块** copies a ready-made block — paste it into a greeting and the panel fills the moment the chat opens.

---

## 2. Style it

Open the **样式 (Style)** tab. Two modes:

### 简易 (Simple) — no code

Sliders and colour pickers with a live preview: choose an accent colour, corner radius, and font, then save.

![Simple mode](images/style-simple.png)

### 高级 (Advanced) — full control

One box where you paste HTML plus a `<style>` block, previewed as you type.

![Advanced mode](images/style-advanced.png)

Three **tokens** are swapped in when the panel renders:

| Token | Becomes |
|---|---|
| `{field_name}` | the stored value (empty → a grey `—`) |
| `{sp_actions}` | the 🔄 重试 / ✏ 编辑 buttons |
| `{sp_badge}` | the source label |

Everything renders inside a narrow (~380 px) sandboxed frame, so chat styles can't leak in and yours can't leak out. **One rule: always set your own `background`** — there is none by default, so text otherwise floats on the bare chat bubble.

Example — fields `mood`, `location`, `inner_thoughts`:

```html
<div class="panel">
  <div class="card"><span class="lbl">MOOD</span><span class="val">{mood}</span></div>
  <div class="card"><span class="lbl">WHERE</span><span class="val">{location}</span></div>
  <div class="card wide"><span class="lbl">THOUGHTS</span><span class="val">{inner_thoughts}</span></div>
  <footer class="foot">{sp_badge}{sp_actions}</footer>
</div>
<style>
  /* REQUIRED — the frame is transparent, so paint your own surface */
  .panel { background:#1a1420; color:#eadfff; font:13px/1.5 system-ui, sans-serif;
           display:grid; grid-template-columns:1fr 1fr; gap:8px;
           padding:10px; border-radius:12px; max-width:380px; }
  .card { background:rgba(255,255,255,.05); border-radius:10px; padding:8px 10px; }
  .wide { grid-column:1 / -1; }                 /* one full-width row */
  .lbl  { font-size:10px; opacity:.6; letter-spacing:.08em; text-transform:uppercase; }
  .val  { font-size:13px; line-height:1.4; }
  .foot { grid-column:1 / -1; display:flex; align-items:center;
          justify-content:flex-end; gap:10px; }
</style>
```

The buttons and badge are real elements — style them by class:

```css
.sp-btn-retry, .sp-btn-edit {                   /* the 🔄 / ✏ buttons */
  all:unset; cursor:pointer; padding:4px 14px; border-radius:999px;
  background:#5c6bc0; color:#fff; font:600 12px/1.4 system-ui, sans-serif;
}
.sp-btn-retry:hover, .sp-btn-edit:hover { filter:brightness(1.15); }
.sp-btn-retry:disabled { opacity:.4; cursor:not-allowed; }   /* while generating */
.sp-badge {                                     /* the source label */
  background:rgba(120,200,120,.15); color:#7ccf7c;
  border-radius:999px; padding:2px 8px; font-size:9px;
}
```

---

## 3. Let AI write the CSS

Don't want to hand-write CSS? Copy **复制状态块**, paste it into the prompt below with one line describing the look you want, run it in any chat model (Claude, ChatGPT…), and paste the result straight into 高级模式.

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
| whole panel; write the selector as `body`, `:root`, or `.sp-iframe-root` | `background`, `color`, `font-family`, `font-size`, `padding`, `border-radius`, `border` — no default background exists, you must declare one |
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

---

## Badges (for players)

The badge shows where the values came from:

| Badge | Meaning |
|---|---|
| 来自回复 | the AI wrote it in the reply |
| 已生成 | you pressed 🔄 重试 |
| 手动 | you edited it by hand (✏ 编辑) |
| 生成失败 | a retry failed — old values are kept, press 🔄 again |

![Manage tab](images/settings-manage.png)

**No panel showing?** The character needs both a definition **and** your consent (启用) — check the 管理 tab above.

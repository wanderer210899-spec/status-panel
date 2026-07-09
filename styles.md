# Status Panel — Styling Reference

The complete HTML/CSS contract for the **rendered status panel** (the card shown under a chat
message). This is the lookup reference; for the how-to walkthrough see [AUTHOR.md](AUTHOR.md)
(English) / [指南.md](指南.md) (中文). 中文版本：[样式.md](样式.md).

Scope: this document covers **only** the panel iframe. It does **not** cover the settings
window (字段/生成/样式/管理 tabs). Everything here is derived from the engine source —
`src/ui/styles.js`, `src/ui/render.js`, `src/ui/layoutgen.js`, `src/core/constants.js`.

---

## 1. How a panel is assembled

Each panel renders inside its own **sandboxed iframe**, one per message. Chat styles cannot
leak in; your styles cannot leak out. The iframe document is built by `spBuildIframeSrcdoc`
(`render.js`) in this fixed source order:

1. **Hoisted** `@import` — any `@import` you write is lifted into its own `<style>` first
  (a mid-sheet `@import` is silently ignored by browsers).
2. **Reset** — `*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}` and
  `html,body{overflow:hidden}`.
3. **Theme variables** — a `:root{ --sp-* }` block computed from the card's theme knobs
  (`spBuildThemeVarBlock`). See §3.
4. **Global chrome sheet** — `SP_IFRAME_GLOBAL_CSS`: all built-in structure, buttons, and
  badge styling. See §4.
5. **Your scoped CSS** — your custom CSS, rewritten under `.sp-iframe-root` (see §7). It comes
  **last in source order, so it wins** on equal specificity.

Your template markup is placed in the body wrapped as:

```html
<body>
  <div class="sp-iframe-root">   <!-- your template goes here -->
    …your HTML…
  </div>
  <script>…engine bridge…</script>
</body>
```

`.sp-iframe-root` is the outermost element you can target. There is **no default background** —
you must paint your own surface, or panel text floats on the bare chat bubble.

---



## 2. Template tokens (interpolation)

`spInterpolateTemplate` (`render.js`) rewrites these tokens before the iframe is built. It runs
the label pass first, then the value pass.


| Token            | Becomes                                    | Notes                                           |
| ---------------- | ------------------------------------------ | ----------------------------------------------- |
| `{{field_name}}` | the field's **name** (label), HTML-escaped | Label pass (S14). Runs before values.           |
| `{field_name}`   | the field's **stored value**, HTML-escaped | Value pass. Use the field's exact key.          |
| `{sp_actions}`   | the 🔄 重试 / ✏ 编辑 button row (see §5)       | Reserved. Expands to `SP_DEFAULT_ACTIONS_HTML`. |
| `{sp_badge}`     | the source badge (see §6)                  | Reserved. Empty when there is no source.        |


**Empty values.** When a field's value is `undefined`, `null`, or `''`, `{field_name}` expands
to a placeholder dash, not the example value:

```html
<span class="sp-ph sp-ph-dash" aria-hidden="true">—</span>
```

Exception: inside a `<style>` block the same token expands to the **plain text** `—` (no span),
so CSS is never corrupted. This is how the 简易 progress bar keeps working with no data.

> Note: single braces `{name}` = value, double braces `{{name}}` = label. Match your field's
> key **byte-for-byte** (Chinese keys included). An unmatched token is left in place as literal
> text.

---



## 3. CSS custom properties (`--sp-*`)

`spBuildThemeVarBlock` always emits all ten variables on `:root`, resolving each empty theme
knob to an accent-derived default. The **global sheet reads them with the same fallbacks**, so
these defaults also apply if you render markup outside the theme system. Set your own values by
declaring the variable (e.g. `.sp-iframe-root{ --sp-accent:#e0a; }`) or just use `var(--name)`
in your CSS.


| Property                | Default                                                 | Controls                                               |
| ----------------------- | ------------------------------------------------------- | ------------------------------------------------------ |
| `--sp-accent`           | `#7c9cff`                                               | Base accent — bars, pills, button + badge tints, title |
| `--sp-radius`           | `12px`                                                  | `.spg-card` corner radius                              |
| `--sp-text-size`        | `13px`                                                  | `.spg-card` base font size                             |
| `--sp-text-color`       | `rgba(255,255,255,.92)`                                 | `.spg-card` text color                                 |
| `--sp-title-color`      | follows `--sp-accent`                                   | `.spg-title` and `.sp-badge` text                      |
| `--sp-border-color`     | `color-mix(in srgb, var(--sp-accent) 42%, transparent)` | `.spg-card` border                                     |
| `--sp-btn-color`        | `color-mix(in srgb, var(--sp-accent) 14%, transparent)` | Button background                                      |
| `--sp-btn-border-color` | `color-mix(in srgb, var(--sp-accent) 40%, transparent)` | Button + fold-chip border                              |
| `--sp-btn-text-color`   | `inherit`                                               | Button text color                                      |
| `--sp-font`             | system UI stack                                         | `.spg-card` font family                                |


**Per-field bar variable (简易 only).** For each number field, `layoutgen` sets an inline
`--spg-v:{value}` on that row's `.spg-fill`, and the fill width is
`clamp(0%, calc((var(--spg-v) - min) / (max - min) * 100%), 100%)`. An empty value makes the
`calc` invalid, so the bar collapses to 0 width. This is a layout-generated variable, not part
of the `--sp-*` theme API.

---



## 4. Built-in selectors (`SP_IFRAME_GLOBAL_CSS`)

Every selector the engine ships. Your own CSS (scoped under `.sp-iframe-root`) overrides any of
these on equal specificity because it comes later in source order.

### 4a. 简易 (Simple-mode) layout scaffold

These classes are emitted by the 简易 generator (`spGenerateLayoutHtml`). You can also use them
by hand in 高级 mode to inherit the built-in look.


| Selector              | Element it styles                                                                                                              |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `.spg-card`           | Outer card — font, text color, `rgba(12,14,20,.88)` background (kept ≥0.8 opaque so it stays readable over chat), `--sp-border-color` border, `--sp-radius`, `12px 14px` padding |
| `.spg-head`           | Header row — flex, `gap:8px`, `margin-bottom:8px`                                                                              |
| `.spg-title`          | "状态" title — `font-weight:650`, `--sp-title-color`                                                                             |
| `.spg-head .sp-badge` | Badge inside the header — pinned right (`margin-left:auto`)                                                                    |
| `.spg-rows`           | Field list — vertical flex column, `gap:6px`                                                                                   |
| `.spg-row`            | One field row — flex, `align-items:baseline`, `gap:10px`                                                                       |
| `.spg-row-num`        | Number-field row modifier — `align-items:center`                                                                               |
| `.spg-label`          | Field label — `min-width:4.5em`, `opacity:.62`, `.92em`                                                                        |
| `.spg-value`          | Field value cell — grows to fill, `overflow-wrap:anywhere`                                                                     |
| `.spg-value-num`      | Number value cell — `min-width:2.5em`, right-aligned, `tabular-nums`                                                           |
| `.spg-bar`            | Progress-bar track — `height:8px`, rounded, `rgba(255,255,255,.10)`                                                            |
| `.spg-fill`           | Progress-bar fill — `--sp-accent` background, width transition (driven by `--spg-v`)                                           |
| `.spg-pill`           | Enum value chip — rounded, accent-mixed background + border                                                                    |




### 4b. Action buttons + fold


| Selector                                         | Element it styles                                                        |
| ------------------------------------------------ | ------------------------------------------------------------------------ |
| `.sp-actions-wrap`                               | Button row — flex, right-aligned, `gap:8px`, `margin-top:10px`, wraps    |
| `.sp-btn-retry`                                  | 🔄 重试 button — `all:unset`, pill, `--sp-btn-*` themed                    |
| `.sp-btn-edit`                                   | ✏ 编辑 button — same styling as retry                                      |
| `.sp-btn-retry:hover`, `.sp-btn-edit:hover`      | Hover — `filter:brightness(1.18)`                                        |
| `.sp-btn-retry:disabled`                         | Retry while generating — `opacity:.45`, `not-allowed`                    |
| `.sp-actions-fold`                               | Collapsed-buttons wrapper (when 按钮折叠 is on) — column, right-aligned      |
| `.sp-fold-toggle`                                | The `⋯` chip that expands the row — pill, `--sp-btn-border-color` border |
| `.sp-actions-fold .sp-actions-wrap`              | Button row inside a fold — hidden (`display:none`) by default            |
| `.sp-actions-fold.sp-fold-open .sp-actions-wrap` | Button row when opened — `display:flex`                                  |
| `.sp-actions-fold.sp-fold-open .sp-fold-toggle`  | Chip when opened — `opacity:1`                                           |




### 4c. Badge, placeholder, busy


| Selector                | Element it styles                                                                   |
| ----------------------- | ----------------------------------------------------------------------------------- |
| `.sp-badge`             | Source badge — monospace pill, `--sp-title-color` text, accent-mixed fill/border    |
| `.sp-badge-error`       | Failure variant — red text `#e05a5a`, red fill/border (added alongside `.sp-badge`) |
| `.sp-ph`, `.sp-ph-dash` | Empty-value placeholder — `font-style:italic`, `opacity:.55`                        |
| `.sp-busy`              | Generation-in-progress hint text — `opacity:.7`, `.85em`, italic                    |


---



## 5. `{sp_actions}` HTML + interaction

`{sp_actions}` expands to `SP_DEFAULT_ACTIONS_HTML` (`constants.js`):

```html
<div class="sp-actions-wrap">
  <button type="button" class="sp-btn-retry" data-sp-action="retry" data-sp-label="🔄 重试">🔄 重试</button>
  <button type="button" class="sp-btn-edit"  data-sp-action="edit"  data-sp-label="✏ 编辑">✏ 编辑</button>
</div>
```

**Data attributes** (consumed by the in-iframe bridge, `SP_IFRAME_BRIDGE`):


| Attribute                           | Where              | Purpose                                                |
| ----------------------------------- | ------------------ | ------------------------------------------------------ |
| `data-sp-action="retry"` / `"edit"` | on the two buttons | Click posts `{type:'sp-action', action}` to the parent |
| `data-sp-label`                     | on the two buttons | The label to restore after a pending state clears      |


**Runtime behavior driven by the bridge:**

- While a retry is running, every `[data-sp-action="retry"]` button is `disabled` and its text
becomes `⏳ 生成中`; when done it reverts to `data-sp-label`.
- `.sp-fold-toggle` clicks toggle `.sp-fold-open` on the enclosing `.sp-actions-fold`; a tap
elsewhere in the panel collapses an open fold.

You can restyle these buttons freely by class, but keep the `data-sp-action` attributes and the
`{sp_actions}` token if you want the built-in retry/edit wiring.

---



## 6. Badge sources

`{sp_badge}` (`spBuildBadgeHtml`) maps the value source to one badge; an absent source yields an
empty string.


| Source    | Rendered HTML                                       | Player-facing text              |
| --------- | --------------------------------------------------- | ------------------------------- |
| `markers` | `<span class="sp-badge">来自回复</span>`                | AI wrote it in the reply        |
| `auto`    | `<span class="sp-badge">已生成</span>`                 | You pressed 🔄 重试               |
| `manual`  | `<span class="sp-badge">手动</span>`                  | You edited by hand (✏ 编辑)       |
| `error`   | `<span class="sp-badge sp-badge-error">生成失败</span>` | A retry failed; old values kept |


---



## 7. How your custom CSS is scoped

`spScopeAuthorCss` (`styles.js`) rewrites your CSS so it can only affect this panel. The scope
prefix is `.sp-iframe-root` (`SP_IFRAME_AUTHOR_SCOPE`). It is a tokenizer, not a full CSS
parser — nesting (`&`) is preserved.


| You write                              | Becomes                  | Meaning                                         |
| -------------------------------------- | ------------------------ | ----------------------------------------------- |
| `:root`, `html`, `body`                | `.sp-iframe-root`        | The whole-panel surface — set `background` here |
| `body.foo` / `html.foo`                | `.sp-iframe-root.foo`    | Leading `html`/`body` is replaced in place      |
| `.card` (any normal selector)          | `.sp-iframe-root .card`  | Descendant-scoped under the root                |
| `:host(...)`                           | `.sp-iframe-root`        | Shadow-DOM syntax mapped for compatibility      |
| `:host-context(...)`                   | `.sp-iframe-root`        | Context stripped                                |
| `.sp-block-shell…` / `.sp-block-root…` | `.sp-iframe-root…`       | Legacy prefixes remapped                        |
| `&…` (nesting)                         | passed through unchanged | Native CSS nesting works                        |


**At-rules:**

- `@import` — extracted and hoisted into a `<style>` before the reset (write it as the first
line of your `<style>` anyway; verify a web font loaded via a `fonts.gstatic.com` request,
not the console).
- `@media`, `@supports`, `@container`, `@layer`, `@scope`, `@document` — the body is
re-scoped recursively (inner selectors also get `.sp-iframe-root`).
- `@keyframes`, `@font-face`, `@page`, `@counter-style`, `@property`, `@viewport`,
`@font-feature-values` — passed through **unscoped** (their contents are not selectors).

`<style>` wrapper tags pasted into the CSS box are stripped automatically.

---



## 8. Base defaults (the reset)

`spIframeBaseCss` sets the neutral baseline on the root before your CSS runs:

```css
.sp-iframe-root{
  display:block; max-width:100%; overflow:visible; word-break:break-word;
  box-sizing:border-box; color:#2c3e50;
  font-family:system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
  font-size:14px; line-height:1.45; -webkit-text-fill-color:currentColor; color-scheme:light;
}
.sp-iframe-root *{ max-width:100%; box-sizing:border-box; }
```

Practical consequences:

- **Always set your own** `background` — there is none by default.
- If you use `.spg-card`, its own `--sp-text-*` / `--sp-font` values override this base color and
font. If you write bare markup, the base `#2c3e50` text and 14px system font apply until you
override them.
- Target width is roughly **320–380 px**. Never use `100vw` / `100vh` or fixed/absolute
full-page positioning — the frame auto-sizes its height to content via the bridge.

---





## Source map (for maintainers)


| Concern                                      | File · symbol                                                           |
| -------------------------------------------- | ----------------------------------------------------------------------- |
| Global chrome sheet + all `--sp-*` fallbacks | `src/ui/styles.js` · `SP_IFRAME_GLOBAL_CSS`                             |
| `:root` theme var block                      | `src/ui/render.js` · `spBuildThemeVarBlock`                             |
| Base reset / `.sp-iframe-root`               | `src/ui/styles.js` · `spIframeBaseCss`                                  |
| Author-CSS scoper                            | `src/ui/styles.js` · `spScopeAuthorCss`, `SP_IFRAME_AUTHOR_SCOPE`       |
| Token interpolation + empty-value dash       | `src/ui/render.js` · `spInterpolateTemplate`                            |
| Badge HTML                                   | `src/ui/render.js` · `spBuildBadgeHtml`                                 |
| `{sp_actions}` HTML + bridge                 | `src/core/constants.js` · `SP_DEFAULT_ACTIONS_HTML`, `SP_IFRAME_BRIDGE` |
| 简易 markup + `--spg-v` bars                   | `src/ui/layoutgen.js` · `spGenerateLayoutHtml`                          |



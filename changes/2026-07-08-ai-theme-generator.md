<!--
CHANGE REQUEST — captured via spec-communication (Mode 2).
Verify "What it does now" against the actual code before building.
Requires a SPEC.md amendment: adds a SECOND generateRaw path (S1 currently locks to Retry only).
-->

# Change: One-click AI theme generator for the panel look

- **Date:** 2026-07-08
- **Project:** tavernhelper-dev/status-panel
- **Status:** Done (built + harness-verified 2026-07-08, Session 7 — see changelog)

## What it does now
The panel's **look** is set in the **样式 (Styles) tab**, in two modes:
- **简易 (Simple):** the author fills in color/size/font knobs.
- **高级 (Advanced):** the author pastes full custom HTML/CSS by hand (SPEC S7 — "equal billing", same preview/save pipeline).

The panel's **content** is defined separately in the **字段 (Fields) tab** (JSON key names, types,
example values, descriptions). The only place the panel talks to the AI today is the **🔄 重试 (Retry)**
button, which asks the AI to fill in the panel's *values* — never its look (SPEC S1 locks the AI to this
single request path).

The non-technical author's problem: writing the Advanced HTML/CSS by hand is hard, and it's hard to
prompt a general AI to write it well without knowing the panel's internal structure.

## What should change
Add a **one-click AI theme generator** in the custom-HTML (Advanced) area of the 样式 tab, alongside —
not replacing — the existing Advanced HTML block. Flow:

1. Author types a **free-text description** of the look they want (e.g. "dark sci-fi HUD, neon cyan accents").
2. Clicking **Generate** sends that description to the **current AI config** (same AI/path as normal chat /
   Retry) as a **mini side-conversation**, together with **injected knowledge**:
   - the current field/JSON key names + types + example values + descriptions;
   - a full description of the panel's HTML structure and the engine's global CSS + `--sp-*` variable system;
   - the hard rule that generated HTML **must keep the value placeholder `{key}` tokens** so in-chat value
     filling keeps working after a theme is applied.
3. The AI returns a **full custom HTML/CSS** panel design.
4. It's shown as a **live preview**. Nothing is saved until the author clicks **Keep**. **Discard** reverts
   to the previous look.
5. It's a **back-and-forth mini chat**: the author can reply "make it darker / bigger title" and the AI
   refines the *same* design (remembers the previous attempts).
6. On **Keep**, the generated HTML lands in the Advanced block **and is immediately saved** as the card's
   fixed look via the existing save pipeline (see "Keep vs Save" below — Keep persists, no second step).

### Keep vs Save — no contradiction, no data loss (per user, 2026-07-08)
The generator's **Keep** and the Advanced box's **Save** must not read as two competing saves. Rule:
- **Keep = apply + save in one action.** Clicking Keep both drops the HTML into the 高级 Advanced box **and**
  runs the same card save (`spCharDefSave` pipeline) the Advanced **Save** button runs. After Keep, the design
  is **already persisted** — the author never has to also click Save, and the design is **not lost** if they
  don't.
- The Advanced **Save** button remains **only** for later manual edits the author types into the box
  themselves. It is not a required second step after Keep.
- The **only** ways a generated design goes away are an explicit **Discard** or a full page reload **before**
  Keep (deliberate throw-away of an un-Kept draft), never "forgot to save."
- To make this unmistakable in the UI, the Keep button is labelled **保留并保存 / Keep & Save**.

### Conversation lifecycle & storage (per user, 2026-07-08)
- The mini-chat history is held **in memory only** (a per-card object in the engine's iframe scope) — **never**
  written to disk, the character card, or card exports. Storage cost on the card is **zero**; a card with an
  AI-generated theme is the same size as one with a hand-pasted theme (only the final Kept HTML is saved).
- The chat **survives closing the Styles tab / settings window** so an in-progress refinement isn't lost;
  reopening the generator for the **same card** resumes where it left off.
- The chat is **cleared only on Keep or Discard** (a fresh conversation then starts next time).
- Boundary (acceptable): because it's in-memory, a **full ST page reload** (or the engine being disposed) also
  clears it. It is **scoped per card** (keyed by avatar) — switching characters shows that card's own draft
  chat, not another's.

The generated look then **stays fixed** — it does not change when panels regenerate values in chat.

### Reusing a saved design (per user, 2026-07-08)
Because **Keep** lands the full HTML in the **高级 (Advanced)** box, a Kept design is always viewable and
copyable there even after the mini-chat is discarded. To modify a saved design later, the author **manually
copies** the Advanced HTML and **pastes it into the generator's text box** with instructions ("make the title
gold"). No dedicated "load current design" button — the reuse path is plain copy-paste. The generator's
injected instructions tell the AI: *if the message contains existing panel HTML, treat it as the base design
to modify per the accompanying instructions.*

### UI design (low-friction, per user, 2026-07-08)
The generator adds almost no chrome. Its **visual** output is the existing live preview; its **code** output is
the existing 高级 Advanced box. The generator itself is just a text box + one action button that toggles
Generate → Refine, plus Keep/Discard once a design exists.

```
样式 / Styles tab
  ( 简易 Simple )  [ 高级 Advanced ]           ← existing mode toggle

  ✨ AI 主题生成 / AI Theme Generator
     [ describe the look you want …            ]  ← free-text box
        (also paste a saved design here to modify it)
                                    [ 生成 / Generate ]

  预览 / Live Preview
     [  rendered panel preview (empty until first Generate)  ]

  — after Generate, the box becomes a refine turn —
  ✔ 设计已生成 · refine or keep:
     [ make the title gold, round corners …   ]
                                    [ 继续 / Refine ]
            [ 保留并保存 / Keep & Save ]   [ 放弃 / Discard ]
                    ↑ applies + persists in one click (no separate Save needed)

  — on Keep & Save, code lands AND is persisted; Advanced box shows it —
  高级 HTML / Advanced
     [ <div class="sp-panel">…full kept HTML…</div>
       <style>… --sp-* …</style>  {token}s preserved   ]  ← copy to reuse
                                    [ 保存 / Save ]  ← only for later manual edits
```


## Why now
The author is non-technical and finds the Advanced CSS/HTML settings hard to grasp and hard to prompt a
generic AI into writing correctly. Giving the AI the panel's own structure (injected) plus a one-click,
preview-and-keep loop removes the hand-coding barrier while keeping full creative freedom.

## Must stay the same (regression guard) — REQUIRED
- **字段 / panel variable definitions never change** as a result of theme generation — key names, types,
  example values, descriptions are untouched.
- **In-chat value filling keeps working** exactly as now: Path A auto-parse and the 🔄 重试 path still fill
  the panel's values (SPEC S1/S5). The generated HTML must preserve the `{key}` value tokens.
- The existing **简易 (Simple)** mode and the manual **高级 (Advanced)** paste-and-save pipeline keep working
  unchanged. The new generator is an addition next to them.
- **Engine settings never touch the card** (SPEC S11) — API keys/consent stay engine-side; the generated
  theme HTML is a card-level key that flows through `spCharDefSave`'s whitelist.
- The global stylesheet + `--sp-*` variable model (SPEC S6) is preserved; author HTML stays scoped and
  layered after the global sheet.

## Rewrite policy — pick one (REQUIRED)
- [x] **Additive only** — add the generator alongside the existing Advanced block; change as little existing
  code as possible. *(default — chosen)*
- [ ] Refactor allowed
- [ ] Replace

## Cleanup expectation
- [x] No old code path is being replaced, so nothing to delete. If any scaffolding/preview plumbing is added
  and later unused, remove it rather than leave residue.

## Acceptance check
> Done when I can open the 样式 tab, type a look description, click Generate, see a live preview of a full
> custom HTML/CSS panel, refine it with a follow-up message, click **Keep** to save it as the panel's fixed
> look — and afterward my field definitions are unchanged and the panel still fills in its values in chat
> (via normal generation and 🔄 重试) exactly as before. Also: after a Kept design, I can open the 高级
> Advanced box, copy the full HTML, paste it back into the generator box with a change instruction, and get a
> modified design — even though the previous chat was discarded.

## Assumptions & open questions
- **Assumption:** the design request uses the **same API path as 重试** (`generateRaw` against the current
  AI config in `src/api/generate.js`), not the custom OpenAI endpoint separately.
- **Assumption:** "current AI config" = whatever the user's normal chat/Retry uses; no new API settings added.
- **Assumption (SPEC impact):** this adds a **second** `generateRaw` call site — a design/theme request —
  which contradicts SPEC **S1** ("two generation paths only"). This requires a **SPEC amendment (new ID,
  e.g. S12)** to legalize a design-generation path distinct from value generation. To be written before code.
- **Resolved (2026-07-08):** mini-chat history is in-memory, per-card, survives closing the window, clears on
  Keep/Discard (and on page reload). Zero card/disk storage; only the final Kept HTML is saved. See
  "Conversation lifecycle & storage" above.
- **Open question (defaulted):** if the AI returns malformed HTML or drops the `{key}` tokens, default plan is
  to warn the author and block Keep until tokens are present (reuse `spTemplateTokenWarnings`). Confirm at
  build time.

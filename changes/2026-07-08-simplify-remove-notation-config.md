<!--
CHANGE REQUEST — remove two author-facing "notation config" features to simplify the UI.
Verified against code before writing. Tag purge touches the card schema + parser → SPEC amendment (S13).
-->

# Change: Remove 实时值 insert-helper and 状态块标记 tag override

- **Date:** 2026-07-08
- **Project:** tavernhelper-dev/status-panel
- **Status:** Done (built + harness-verified 2026-07-08, Session 8 — see changelog; SPEC S13)

## What it does now
Two advanced knobs let the author fiddle with panel "notation":
1. **实时值 insert helper** — in the 高级 (advanced) styles editor, a dropdown
   *「插入 {name}（实时值）…」* ([panel.js:870](../src/ui/panel.js)) that inserts a `{fieldKey}`
   value token into the template at the cursor. The `{name}` token system itself is what makes
   panels show live values.
2. **状态块标记 (custom tag override)** — in the 生成 tab, two inputs
   (`状态块标记` start/end, [panel.js:1346](../src/ui/panel.js)) storing `tagStart`/`tagEnd` on the
   card. The engine reads the status block between these markers; empty = default invisible
   `<!--status-panel-->` / `<!--/status-panel-->`. Wired through `spTagPair` (parser.js), the card
   whitelist + templates (store.js), the 字段-tab 复制状态块 button, retry prompt assembly, and parsing.

## What should change
Remove both from the author UI to simplify — the non-technical author shouldn't have to configure
panel notation.

1. **实时值 helper — remove the helper only.** Delete the *「插入 {name}」* dropdown row and its
   help line. **KEEP the `{name}` token system fully working** — panels still fill live values;
   简易 mode and the AI generator still emit `{key}` tokens; authors can still type tokens by hand.
2. **状态块标记 — full purge.** Remove the UI, its save/read wiring, the `tagStart`/`tagEnd` card
   keys (whitelist + `SP_CHARDEF_TEMPLATE` + `SP_CONFIG_BASE`), and the `spTagPair` override so the
   engine **always** uses the default invisible markers `MARKER_START`/`MARKER_END`.

## Why now
The author finds these config knobs confusing and unnecessary; they add cognitive load without
matching how a non-technical user works.

## Must stay the same (regression guard) — REQUIRED
- **Live value filling** — `{key}` tokens still substitute in every panel (chat + preview). This
  is the core mechanism and is explicitly NOT removed.
- **简易 mode + AI Theme Generator** still produce templates containing the `{key}` tokens.
- **复制状态块** (字段 tab) still works — it just always uses the default invisible markers now.
- **Retry (重试) + Path-A parsing** still find/emit the status block, using the default markers.
- Existing cards on the **default** markers (the vast majority) are unaffected.

## Rewrite policy — pick one (REQUIRED)
- [ ] Additive only
- [ ] Refactor allowed
- [x] **Replace** — the two features are intentionally removed. Delete: the 实时值 insert-helper
  DOM+wiring; the 状态块标记 UI+wiring; `tagStart`/`tagEnd` from the schema; the `spTagPair` cfg
  override (collapse to constant default markers).

## Cleanup expectation
- [x] Remove all replaced code and unused leftovers — no dead DOM, no orphaned wiring, no vestigial
  `tagStart`/`tagEnd` references or whitelist entries. `spTagPair` becomes a no-arg helper returning
  the default markers (or is inlined); all call sites updated.

## Accepted consequence (full purge)
- Any legacy card that set **custom** `tagStart`/`tagEnd` will stop parsing its status block (it now
  expects the default invisible markers). User accepted this in intake. On next save such keys are
  stripped from the card.

## Acceptance check
> Done when: the 高级 editor no longer shows the 「插入 {name}」 dropdown but `{key}` tokens still fill
> values in chat and preview; the 生成 tab no longer shows the 状态块标记 inputs; a fresh card's status
> block uses the default invisible markers; and no `tagStart`/`tagEnd` remains in the code or schema.

## Assumptions & open questions
- **Assumption (SPEC):** the tag purge needs a **SPEC amendment S13** (removes the tag-override
  capability; status blocks are always delimited by the default invisible markers). To be written first.
- **Assumption:** the 实时值 helper removal is UI-only, no SPEC impact (S7 doesn't mandate the helper).

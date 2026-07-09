# Change: move the AI-write-CSS prompt into styles.md; make styles.md the single theme guide

- **Date:** 2026-07-08
- **Project:** tavernhelper-dev/status-panel · Docs (external-model styling route)
- **Status:** Building

## What it does now
The copy-paste prompt for having an external model (Claude/ChatGPT) write the panel's HTML/CSS
lives in **AUTHOR.md §3 "Let AI write the CSS"**. `styles.md` is the selector/token/variable
reference but does **not** contain the generation prompt. So an author following the AI route
reads the prompt in one file and the selector contract in another.

## What should change
- **Move** the AUTHOR.md §3 prompt (intro + note + the full fenced prompt block) into `styles.md`
  as a new section, so `styles.md` is the single authoritative guide to generate a valid theme.
- **Remove AUTHOR.md §3 entirely** (user's explicit choice — no leftover pointer stub). AUTHOR.md
  already links to `styles.md` from §2, which stays.
- Move is **as-is**: prompt wording is not rewritten in this change. Only a self-reference fix —
  the prompt's line "The authoritative selector list is styles.md" would point the file at itself,
  so it becomes "the tables above."

## Why now
User: "move the AI write-CSS prompt from author.md to styles.md so that styles.md becomes the
ultimate guide to generate a valid theme." Follows the removal of the in-app generator
(`changes/2026-07-08-remove-ai-theme-generator.md`) — the external-model prompt is now the
recommended styling route, so it belongs with the styling contract.

## Must stay the same (regression guard)
- Prompt **text is unchanged** except the one self-reference line noted above.
- AUTHOR.md §1, §2, Badges section, and its existing `styles.md` links — untouched.
- styles.md §1–8 reference content and the Source map — untouched; the prompt is **added**, not
  interleaved.

## Rewrite policy — Additive/Move (no wording rewrite)
- [x] Move the section verbatim (minus the self-reference fix). No prompt-quality edits here.
- Prompt-quality / "output not working" fixes are a **separate** follow-up, pending diagnosis +
  user approval (see below).

## Cleanup expectation
- AUTHOR.md §3 removed, not commented out. The `---` separator structure around it stays valid.

## Acceptance check
> Done when: styles.md contains the full AI-write-CSS prompt as a clearly-titled section; AUTHOR.md
> no longer has a "Let AI write the CSS" section and still reads cleanly; no duplicated prompt text
> across the two files.

## Follow-up (NOT this change) — diagnose "output not working"
A model produced a panel (custom `.fs-*` classes + `{时间}`/`{好感度}` value tokens + `{sp_badge}`
/`{sp_actions}`) that the user reports as "not working," and suspects styles.md carries
unnecessary info. Next step: probe the rendered panel with Chrome DevTools, then **report
findings only** — the user decides whether to rewrite the prompt / selector tables. Not started.

## Open items
- **指南.md (Chinese guide)** has the parallel §3. This change touches only AUTHOR.md/styles.md per
  scope; 指南.md divergence is flagged to the user, not silently edited.

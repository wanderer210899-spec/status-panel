# Change Request — 2026-07-09 — mobile/CSS fixes + save workflow

Mode: Change Request (spec-communication). Project: status-panel.
Follows: `changes/2026-07-09-theme-and-docs.md` (settings window + edit modal → ST theme).
Rewrite policy: **Refactor allowed** (may restructure settings/tab state; all working behavior — fields, two injection modes, badges, the in-chat panel — must be preserved).

**Status:** Pass 1 (B1–B4) **COMPLETE + harness-verified** 2026-07-09 / Session 3 (build 4986 lines,
`node --check` clean; chrome-devtools MCP on localhost:8000 — see plan.md/changelog.md for the
measured results). **Pass 2 (F1/F2) COMPLETE + harness-verified** 2026-07-09 / Session 4 (build 5130
lines): draft persists across tab switches AND close/reopen; 深度=7 + instruction survived a
生成→字段→生成 round-trip and a close/reopen; header "● 未保存" cue + 清除更改 button appear on edit
and hide after Clear/save; 清除更改 reverted 深度 7→0 and the instruction to its saved text; a clean
tab visit raised no false cue; accent `#123456` (+ hex companion) persisted 样式→管理→样式. F2
default-layout seeding is guarded to first setup (empty template) — logic in place, not exercised on
the harness character (it already has a template, so its fields-save keeps the prior fields-only path).

## Split into two passes (user decision: "bugs first")

### Pass 1 — visual bugs (this session)

- **B1 — mobile color picker degrades.** On mobile, the 样式 (styles) color control stops being a
  full color wheel and shows only a few preset color swatches.
  - Done when: on a phone-width viewport, the color control still offers full color selection
    (not a reduced swatch list).
- **B2 — 生成 tab field misalignment.** In the 生成 tab, the 注入位置 / 深度 / 角色 controls
  (label + input groups) are visually misaligned (see user screenshot).
  - Done when: the 深度 and 角色 label+input groups line up on a consistent baseline/grid at
    desktop and phone widths.
- **B3 — translucent panel background.** Some ST themes set an alpha on the surface var
  (`--SmartThemeBlurTintColor`), so chat text bleeds through the panel/settings window (visible in
  the screenshot). Enforce an **opacity floor of ≥ 0.8** on the background of **both** the in-chat
  status panel AND the settings window, regardless of theme.
  - Done when: with a theme whose tint var is highly translucent, neither surface's background lets
    chat text read through; effective background alpha is ≥ 0.8.
- **B4 — checkbox/label separation.** The 按钮折叠（⋯ 展开操作栏）checkbox is not adjacent to its
  label.
  - Done when: the checkbox sits immediately next to its 按钮折叠 label like the other toggles.

### Pass 2 — save/persistence workflow (next session, captured here so it survives)

- **F1 — no data loss between tabs.** Switching tabs currently discards typed input. Values must
  persist across tab switches; cleared only on reload or via a manual **Clear** button placed
  **top-right** of the settings window.
- **F2 — smarter Save.** Keep the Save button but show a clear **unsaved-changes cue** near it; and
  when fields are first added, seed the panel with **default colors** so it renders correctly
  immediately (no blank/broken panel before the user customizes colors).

## Must stay the same (regression guard)

- The two prompt-injection modes (appended-to-prompt / retry-only) and their badges.
- Field definitions, the 复制状态块 action, 🔄 重试 / ✏ 编辑 actions.
- The ST-theme inheritance shipped 2026-07-09 (settings window + edit modal). B3's opacity floor
  **layers on top of** that theming — it must not revert to a hardcoded palette; it clamps only the
  effective alpha of the resolved background.
- The in-chat panel's own `--sp-*` theming.

## Cleanup expectation

Refactor allowed, but any code path replaced (e.g. old tab-switch handling for F1) is removed, not
left as dead residue. Verify at session end.

## Build target this session

Pass 1 only: B1, B2, B3, B4. Rebuild (`node build.js` = deploy), `node --check main.js`, then verify
in the Docker harness via chrome-devtools MCP at desktop + phone widths.

## Assumptions

- B1 "color wheel → swatches" is the browser's native `<input type="color">` behavior differing by
  platform; fix = ensure a full-range picker on mobile (verify the actual control in code first).
- B3 opacity floor implemented by clamping the resolved surface color's alpha (e.g. layering an
  opaque base under the tint, or `color-mix` toward an opaque backdrop), not by dropping ST vars.

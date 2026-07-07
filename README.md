# Status Panel (TavernHelper global engine)

**v2.** A status-panel *engine* for SillyTavern, installed once as a TavernHelper **global** script. The engine itself is invisible; individual characters opt in by carrying a **panel definition inside their character card** (`data.extensions.status_panel`, written via `ctx.writeExtensionField`). Definitions travel with card exports/imports; importing a card with a definition shows a Chinese consent banner (启用 / 暂不) before anything activates.

All end-user UI is Chinese. Docs and code are English.

## What it does

- **Detect** a status block in each assistant reply: configurable tag (default `<!--status-panel-->…<!--/status-panel-->`), accepting **JSON or `键: 值` lines** inside.
- **Instruct** the AI automatically: a Chinese instruction (field constraints + tag example) is injected via `ctx.setExtensionPrompt` while a panel is enabled. A 「复制 AI 指令」 button covers manual preset/lorebook placement.
- **Fall back** (optional, per definition `regenMode`): when a reply has no status block, run a silent `TavernHelper.generateRaw` with a JSON schema. Failures store an explicit `source:'error'` state (badge 生成失败 + always-available 重试) — never fake data.
- **Render** stored values in a sandboxed `srcdoc` iframe under the message. Two design modes: 简易 (deterministic layout generator from the field list + theme knobs) and 高级 (paste full HTML with `{字段名}` tokens).

## Three storage layers (strictly separated)

| Layer | Contents | Where |
|---|---|---|
| Engine settings (per user) | API mode/endpoint/key/model, consent lists, injection toggle, history settings | TH global variables, key `status_panel_engine` — **never written to cards** |
| Panel definition (per character) | `version`, `fields[]`, `htmlTemplate`, `designMode`, `theme`, `regenMode`, `tagStart/tagEnd`, `defaultPromptContent` | Character card `data.extensions.status_panel` |
| Status values (per message/swipe) | `{ values, source: markers\|auto\|manual\|error, error? }` | `message.data.statusPanel` via `TH.setChatMessages` + `{refresh:'none'}` |

## Dev loop

1. Edit source under `src/` (never hand-edit `main.js` or `dist/*`).
2. `node build.js` in this folder → refreshes `main.js`, `dist/status-panel.js`, `dist/status-panel.json`. The harness copy is an NTFS junction, so a rebuild is a deploy.
3. Reload the ST page (or use the dev loader's **SP 重载** button) to load the new bundle.
4. Smoke-check: open a chat with a definition-bearing character → panel renders on the last assistant message; **SP 面板** button opens the four-tab settings window (字段 / 样式 / 生成 / 管理).

## End-user install

Import **`dist/status-panel.json`** into TavernHelper's **global** script tab (脚本库 → 全局). Engine API keys live in TH global variables — they never enter character cards (verified against exported PNGs).

## Docs

- **`AUTHOR.md`** — image-led guide (English): set up fields, style the panel (simple + advanced, with example HTML/CSS), the paste-ready AI-styling prompt, and badge meanings.
- **`指南.md`** — the same guide in Chinese (mirrors `AUTHOR.md` section-for-section).
- **`architecture.md`** — engine contract: storage layers, lifecycle states, render pipeline, bridge protocol, CSS scoping, invariants.
- **`agent.md`**, `plan.md`, `changelog.md` — project routing and state.

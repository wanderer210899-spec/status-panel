# Status Panel — Guide

A live status card under each AI reply — mood, location, stats — defined in the character
card and carried along whenever you export it.

> 中文版：[指南.md](指南.md) · Styling reference: [styles.md](styles.md)

![A styled status panel under a chat message](images/panel-in-chat.png)

## Buttons & tabs

Open TavernHelper's script toolbar and tap **SP 面板** — the only button. It opens a settings
window (which follows your SillyTavern theme) with four tabs:

- **字段 (Fields)** — add each field: a name, a type (text / number / enum), and an example
  value. Save.
- **生成 (Generate)** — how values get filled (see below), with a live preview of the injected
  instruction.
- **样式 (Style)** — **简易** (sliders + colour pickers, no code) or **高级** (paste your own
  HTML + CSS). Full selector list: [styles.md](styles.md). Want AI to write the CSS? Use the
  prompt in [styles-prompt.md](styles-prompt.md).
- **管理 (Manage)** — enable, disable, or remove the panel per character, and clear stored data.

Under each panel are two actions: **🔄 重试** regenerates the values, **✏ 编辑** lets you edit
them by hand. **复制状态块** copies a ready-made block — paste it into a greeting and the panel
fills the moment the chat opens.

## How values get filled — two modes

1. **Appended to the prompt (automatic).** While a panel is enabled and has fields, a short
   instruction is silently added to *every* request, telling the AI to output those values in
   its reply. There is no switch — it is always on. Filled this way, the badge reads **来自回复**.
2. **Retry only (on demand).** Pressing **🔄 重试** sends a separate one-off request that asks
   *only* for the values, then writes them back (**已生成**, or **生成失败** if it fails — old
   values are kept). Nothing else is ever auto-generated; an empty panel just shows dashes until
   the AI fills it or you retry.

## Badges

来自回复 = AI wrote it · 已生成 = you retried · 手动 = you edited it · 生成失败 = retry failed.

**No panel showing?** The character needs a definition **and** your consent (启用) — check the
**管理** tab.

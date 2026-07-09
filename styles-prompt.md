# 用于直接复制粘贴给ai写css

```
You are a front-end designer. Produce ONE HTML fragment with a SINGLE inline <style> block that
renders a compact "status panel" card inside a sandboxed chat iframe. Output only the code block —
no prose, no <!DOCTYPE>/<html>/<head>/<body>.

Copy the SHAPE and the techniques of this example exactly — only the visual style should change.

  EXAMPLE INPUT
    {"mood":"calm","energy":72,"note":"resting by the fire"}
    energy: 0-100 bar · mood: short text · note: long text

  EXAMPLE OUTPUT  (this is the format to produce)
    <div class="panel">
      <div class="hd"><span class="ttl">STATUS</span>{sp_badge}</div>
      <div class="row"><span class="k">Mood</span><span class="v">{mood}</span></div>
      <div class="row"><span class="k">Energy</span><span class="bar"><i class="fill"></i></span><span class="n">{energy}</span></div>
      <div class="row"><span class="k">Note</span><span class="v">{note}</span></div>
      <div class="ft">{sp_actions}</div>
    </div>
    <style>
      body{background:#141019;}                                  /* fallback: fills the transparent frame */
      .panel{background:#1e1830;color:#e9e2ff;font:13px/1.5 system-ui,sans-serif;padding:12px 14px;border-radius:12px;max-width:520px;margin-inline:auto;} /* fills mobile, capped on PC */
      .hd{display:flex;align-items:center;gap:8px;margin-bottom:8px;}
      .ttl{font-weight:650;letter-spacing:.04em;}
      .hd .sp-badge{margin-left:auto;}
      .row{display:flex;align-items:center;gap:10px;margin:5px 0;}
      .k{min-width:4em;opacity:.6;font-size:.9em;}
      .v{flex:1;overflow-wrap:anywhere;}
      .n{min-width:2.4em;text-align:right;font-variant-numeric:tabular-nums;}
      .bar{flex:1;height:7px;border-radius:5px;background:rgba(255,255,255,.14);overflow:hidden;}
      .fill{display:block;height:100%;background:#a98bff;width:{energy}%;}  /* value token lives in <style>: empty -> ignored, bar stays 0 */
      .ft{display:flex;justify-content:flex-end;margin-top:10px;}
      @media (min-width:440px){ .panel{padding:16px 18px;} .k{min-width:5em;} }  /* roomier on PC */
    </style>

  Note: {sp_badge} and {sp_actions} are pre-built engine elements — include each once and style
  them by class (.sp-badge / .sp-actions-wrap / .sp-btn-retry / .sp-btn-edit); do not recreate them.
  Any field with no value auto-renders a muted dash, so partial data still looks intentional.

══════════════  MY PANEL — build this  ══════════════

MY FIELDS (JSON — use these EXACT keys as {key} tokens; nothing renamed, added, or dropped):
### <这里粘贴状态栏 JSON, e.g. {"心情":"平静","好感度":50}>

HOW TO DISPLAY EACH FIELD (types / ranges — the JSON has none):
### <e.g. 好感度: 0-100 进度条 · 心情: pill · 内心想法: 段落>

STYLE BRIEF (the look I want):
### <这里写风格要求>

CHECK EVERY LINE BEFORE YOU OUTPUT — MUST / NEVER:
1. Exactly one <style> block; plain class selectors only (never :root / .sp-iframe-root / body-less globals renamed).
2. Paint a background on your wrapper AND on `body` — the frame is transparent, or text floats on the chat bubble.
3. {key} tokens go in visible TEXT only. NEVER inside an attribute (style="width:{x}%" breaks on empty). Drive bar widths from inside <style>, one fill-class per number.
4. {sp_actions} once, {sp_badge} once. Field keys byte-for-byte (Chinese included) or the token shows as literal text.
5. RESPONSIVE (mobile + PC): the panel fills its frame — narrow on phones, wide on desktop. NEVER hardcode a pixel width; give the wrapper `width:100%` behaviour with `max-width:~520px; margin-inline:auto`, keep inner layout fluid (%, flex-wrap). Optionally add `@media (min-width:440px){…}` for a roomier desktop layout (it keys off the panel's own width). No 100vw/100vh, no fixed/absolute full-page positioning.
6. Web font? Put ONE @import url('https://…') as the literal FIRST line of <style>. No <link>/<script> — external resources are blocked.

Output the code block now.
```


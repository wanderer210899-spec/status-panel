// ─── Main-message status-block extraction (no regex for the tag scan) ───────

/**
 * Effective tag delimiters for the AI's status block.
 * Definitions may override (`tagStart`/`tagEnd`) so authors can port panels whose
 * prompts already emit e.g. `<StatusBlock>…</StatusBlock>`; empty = default markers.
 */
function spTagPair(cfg) {
  const start = cfg && typeof cfg.tagStart === 'string' && cfg.tagStart.trim() ? cfg.tagStart.trim() : MARKER_START;
  const end = cfg && typeof cfg.tagEnd === 'string' && cfg.tagEnd.trim() ? cfg.tagEnd.trim() : MARKER_END;
  return { start, end };
}

function spTryExtractMarkers(text, startTag, endTag) {
  if (typeof text !== 'string') return { ok: false, error: 'not_string' };
  const start = text.indexOf(startTag);
  const end = text.lastIndexOf(endTag);
  if (start === -1 || end === -1 || end <= start) return { ok: false, error: 'markers_missing' };
  const inner = text.slice(start + startTag.length, end).trim();
  try {
    const parsed = JSON.parse(inner);
    return { ok: true, value: parsed, inner };
  } catch (e) {
    const detail = String(e && e.message ? e.message : e);
    // Extract character position from V8/Node error messages:
    // "Unexpected token } in JSON at position 47" / "... at position 47 (line N column C)"
    const m = /at position (\d+)/.exec(detail);
    const pos = m ? Number(m[1]) : -1;
    let line = 0;
    let col = 0;
    if (pos >= 0) {
      const before = inner.slice(0, pos);
      line = (before.match(/\n/g) || []).length;
      col = pos - (before.lastIndexOf('\n') + 1);
    }
    return { ok: false, error: 'json_parse', detail, inner, pos, line, col };
  }
}

/**
 * Lenient `键: 值` / `key: value` line parser for tag content that isn't valid JSON.
 * Only keys matching a defined field name are kept (trimmed; latin keys case-insensitive),
 * so prose lines inside the tag can't pollute values. Number fields get a first-number
 * rescue (`好感度: 55/100` → 55) since free-form output often decorates numerals.
 */
function spParseKeyValueLines(inner, fields) {
  const names = (fields || []).map((f) => String(f.name || '').trim()).filter(Boolean);
  if (!names.length) return { ok: false, error: 'kv_no_fields' };
  const byLower = new Map();
  const typeByName = new Map();
  for (const f of fields || []) {
    const n = String(f.name || '').trim();
    if (!n) continue;
    byLower.set(n.toLowerCase(), n);
    typeByName.set(n, f.type || 'text');
  }

  const out = {};
  let matched = 0;
  for (let line of String(inner || '').split(/\r?\n/)) {
    line = line.trim();
    if (!line) continue;
    // Strip common list/emphasis decorations before the key.
    line = line.replace(/^[-*•·◦▸►\s]+/, '').replace(/\*\*/g, '');
    const m = /^(.{1,40}?)\s*[:：]\s*(.*)$/.exec(line);
    if (!m) continue;
    const rawKey = m[1].trim().replace(/^["'「『【\[（(]+|["'」』】\]）)]+$/g, '');
    const canonical = byLower.get(rawKey.toLowerCase());
    if (!canonical) continue;
    let val = m[2].trim().replace(/^["'「『]+|["'」』]+$/g, '');
    if (typeByName.get(canonical) === 'number' && !Number.isFinite(Number(val))) {
      const nm = /-?\d+(?:\.\d+)?/.exec(val);
      if (nm) val = nm[0];
    }
    out[canonical] = val;
    matched++;
  }
  if (matched === 0) return { ok: false, error: 'kv_no_match' };
  return { ok: true, value: out };
}

/**
 * Extract the status block from a main-API reply.
 * JSON inside the tag wins; otherwise fall back to `键: 值` lines mapped onto the
 * defined field names. `cfg` supplies the tag pair + fields (defaults to effectiveConfig()).
 */
function extractStatusFromMessage(text, cfg) {
  const conf = cfg || effectiveConfig();
  const { start, end } = spTagPair(conf);
  const res = spTryExtractMarkers(text, start, end);
  if (res.ok) return res;
  if (res.error === 'json_parse') {
    const kv = spParseKeyValueLines(res.inner, conf.fields);
    if (kv.ok) return { ok: true, value: kv.value, inner: res.inner, via: 'kv' };
  }
  return res;
}

/**
 * Output-block TEMPLATE with `<descriptor>` placeholders (type / range / enum options / hint)
 * rather than concrete values — so the model fills the CURRENT state instead of copying an
 * example (best-practice prompting, S2/S4). Concrete 示例值 still appear, clearly labelled
 * 示例「X」, in spBuildFieldConstraintsBlock. NOTE: the result is intentionally NOT valid JSON
 * (it carries `<…>` fill-in tokens); the engine never parses it, it is only shown to the model.
 */
function spMarkerJsonPlaceholderForFields(fields) {
  const parts = [];
  for (const f of fields || []) {
    const n = String(f.name || '').trim();
    if (!n) continue;
    const key = JSON.stringify(n);
    if (f.type === 'number') {
      const lo = Number(f.min);
      const hi = Number(f.max);
      let d;
      if (Number.isFinite(lo) && Number.isFinite(hi)) d = `<${lo}–${hi} 的数字>`;
      else if (Number.isFinite(lo)) d = `<≥${lo} 的数字>`;
      else if (Number.isFinite(hi)) d = `<≤${hi} 的数字>`;
      else d = '<数字>';
      parts.push(key + ':' + d); // numbers unquoted
    } else if (f.type === 'enum') {
      const opts = spFieldEnumOptions(f);
      const d = opts.length ? '<' + opts.join('|') + '>' : '<文本>';
      parts.push(key + ':"' + d + '"');
    } else {
      const hint = String(f.hint || '').replace(/["\r\n]+/g, ' ').trim();
      const d = hint ? '<' + hint + '>' : '<文本>';
      parts.push(key + ':"' + d + '"');
    }
  }
  return '{' + parts.join(',') + '}';
}

function spMarkerBlockForFields(fields, cfg) {
  const { start, end } = spTagPair(cfg);
  return start + spMarkerJsonPlaceholderForFields(fields) + end;
}

/**
 * Human-readable bullet list of field constraints (type, range, enum options, defaults).
 * Auto-derived from the field table — never hand-edited — so the model always sees fresh rules.
 * Chinese: this text is model-facing instruction content for a Chinese-audience panel.
 */
function spBuildFieldConstraintsBlock(fields) {
  const lines = [];
  for (const f of fields || []) {
    const n = String(f.name || '').trim();
    if (!n) continue;
    const hint = f.hint ? ` — ${String(f.hint)}` : '';
    if (f.type === 'number') {
      const lo = Number(f.min);
      const hi = Number(f.max);
      let range = '';
      if (Number.isFinite(lo) && Number.isFinite(hi)) range = `，范围 ${lo}–${hi}（含两端）`;
      else if (Number.isFinite(lo)) range = `，最小 ${lo}`;
      else if (Number.isFinite(hi)) range = `，最大 ${hi}`;
      const ex = Number.isFinite(Number(f.value)) && f.value !== '' ? `，示例 ${Number(f.value)}` : '';
      lines.push(`  • 「${n}」（数字${range}${ex}）${hint}`);
    } else if (f.type === 'enum') {
      const opts = spFieldEnumOptions(f);
      const list = opts.length ? opts.map((o) => `「${o}」`).join('、') : '（未定义选项 — 按普通文本处理）';
      lines.push(`  • 「${n}」（文本，只能是以下之一：${list}）${hint}`);
    } else {
      const ex = f.value ? `，示例「${String(f.value)}」` : '';
      lines.push(`  • 「${n}」（文本${ex}）${hint}`);
    }
  }
  if (!lines.length) return '';
  return [
    '字段规则 — 键名必须与下列名称完全一致，值必须满足对应约束：',
    ...lines,
    '文本值按 JSON 规则转义引号。不要添加未列出的键。',
  ].join('\n');
}

/**
 * Build the full AI instruction: author preamble + auto constraints + tag example.
 * Consumers: setExtensionPrompt auto-inject, the 「复制 AI 指令」 button, and (with
 * `forSecondary`) the dedicated generateRaw call — which must NOT ask for an appended
 * tag block since the JSON-schema constraint already demands a bare JSON reply.
 */
function spBuildFullPromptContent(cfg, opts) {
  const forSecondary = !!(opts && opts.forSecondary);
  const preamble = String(cfg.defaultPromptContent || '').trim();
  const constraints = spBuildFieldConstraintsBlock(cfg.fields).trim();
  const parts = [];
  if (preamble) parts.push(preamble);
  if (constraints) parts.push(constraints);
  if (!forSecondary) {
    parts.push(
      '在正文全部结束后，另起一行追加且仅追加一个状态数据块（下列标记 + 一个 JSON 对象，禁止使用 markdown 代码块）。' +
        '把每个 <…> 占位符替换为当前时刻的真实值（键名保持不变，数值不加引号）：\n' +
        spMarkerBlockForFields(cfg.fields, cfg),
    );
  }
  return parts.join('\n\n');
}

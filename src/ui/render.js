// ─── Render status panel into `.mes_text` (tail mount) ──────────────────────

/** Stable JSON stringify for marker signature comparisons (sorts object keys recursively). */
function spStableJsonStringify(value) {
  if (value === null) return 'null';
  const t = typeof value;
  if (t === 'number' || t === 'boolean') return JSON.stringify(value);
  if (t === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(spStableJsonStringify).join(',') + ']';
  if (t === 'object') {
    const keys = Object.keys(value).sort();
    const parts = [];
    for (const k of keys) {
      parts.push(JSON.stringify(k) + ':' + spStableJsonStringify(value[k]));
    }
    return '{' + parts.join(',') + '}';
  }
  // undefined / functions shouldn't appear in parsed marker JSON; normalize anyway.
  return JSON.stringify(null);
}

/**
 * Extract embedded `<style>` blocks and strip top-level document wrappers.
 * Optional `keepScripts`: iframe srcdoc keeps `<script>`; legacy callers omitted strip.
 */
function spExtractEmbeddedStyles(html, opts) {
  const keepScripts = opts && opts.keepScripts === true;
  if (typeof html !== 'string' || !html) return { html: '', extraCss: '' };
  let s = html;
  s = s.replace(/<!DOCTYPE[^>]*>/gi, '');
  s = s.replace(/<\/?html\b[^>]*>/gi, '');
  s = s.replace(/<head\b[^>]*>([\s\S]*?)<\/head>/gi, '$1');
  s = s.replace(/<\/?head\b[^>]*>/gi, '');
  s = s.replace(/<\/?body\b[^>]*>/gi, '');
  s = s.replace(/<title\b[^>]*>[\s\S]*?<\/title>/gi, '');
  s = s.replace(/<meta\b[^>]*\/?>/gi, '');
  s = s.replace(/<link\b[^>]*\/?>/gi, '');
  let extraCss = '';
  s = s.replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gi, (_m, content) => {
    extraCss += '\n' + (content || '');
    return '';
  });
  if (!keepScripts) {
    s = s.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  }
  return { html: s, extraCss };
}

function spRemovePanelFromTextEl(textEl) {
  if (!textEl) return;
  const prev = textEl.querySelector(':scope > .sp-block-root');
  if (prev) prev.remove();
}

function spRemoveErrorBlockFromTextEl(textEl) {
  if (!textEl) return;
  const prev = textEl.querySelector(':scope > .sp-json-error');
  if (prev) prev.remove();
}

/**
 * Remove an exact text sequence from a DOM subtree without destroying markup.
 * This handles cases where ST formatting splits the JSON across many text nodes.
 * Skips any nodes inside an already-mounted `.sp-block-root` to avoid touching iframes.
 */
function spRemoveTextSequenceFromElement(rootEl, seq) {
  if (!rootEl) return false;
  const s = String(seq || '');
  if (!s) return false;

  const doc = rootEl.ownerDocument || document;
  const win = doc.defaultView || window;
  const walker = doc.createTreeWalker(rootEl, win.NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      if (!node || !node.parentElement) return win.NodeFilter.FILTER_REJECT;
      if (node.parentElement.closest && node.parentElement.closest('.sp-block-root')) {
        return win.NodeFilter.FILTER_REJECT;
      }
      const v = node.nodeValue || '';
      return v ? win.NodeFilter.FILTER_ACCEPT : win.NodeFilter.FILTER_REJECT;
    },
  });

  const nodes = [];
  const starts = [];
  let combined = '';
  while (walker.nextNode()) {
    const n = walker.currentNode;
    nodes.push(n);
    starts.push(combined.length);
    combined += n.nodeValue || '';
  }
  if (!combined) return false;

  let changed = false;
  let idx = combined.indexOf(s);
  while (idx !== -1) {
    const end = idx + s.length;

    // Update all overlapping text nodes.
    for (let i = 0; i < nodes.length; i++) {
      const nStart = starts[i];
      const n = nodes[i];
      const v = n.nodeValue || '';
      const nEnd = nStart + v.length;
      if (nEnd <= idx || nStart >= end) continue;

      const localFrom = Math.max(0, idx - nStart);
      const localTo = Math.min(v.length, end - nStart);
      if (localFrom === 0 && localTo === v.length) n.nodeValue = '';
      else n.nodeValue = v.slice(0, localFrom) + v.slice(localTo);
      changed = true;
    }

    // Recompute combined view after the mutation (still cheap; message text nodes are bounded).
    combined = '';
    for (let i = 0; i < nodes.length; i++) combined += nodes[i].nodeValue || '';
    idx = combined.indexOf(s);
  }

  return changed;
}

/**
 * Lightweight JSON tokenizer for debug display. Walks the string once, emitting tokens of the form
 * { type, value, start, end } where type is one of:
 *   'string-key' | 'string-value' | 'number' | 'boolean' | 'null' | 'punct' | 'ws' | 'unknown'
 * Operates on potentially broken JSON — never throws. After the first syntax error the remainder
 * is emitted as a single 'unknown' token so the caret position is still correct.
 */
function spTokenizeJson(text) {
  const tokens = [];
  const s = String(text || '');
  let i = 0;
  // Track whether the previous meaningful token was a colon, so we know if next string is a value.
  let lastMeaningful = '';

  while (i < s.length) {
    // Whitespace
    if (/\s/.test(s[i])) {
      let j = i + 1;
      while (j < s.length && /\s/.test(s[j])) j++;
      tokens.push({ type: 'ws', value: s.slice(i, j), start: i, end: j });
      i = j;
      continue;
    }
    // String
    if (s[i] === '"') {
      let j = i + 1;
      while (j < s.length) {
        if (s[j] === '\\') { j += 2; continue; }
        if (s[j] === '"') { j++; break; }
        j++;
      }
      const raw = s.slice(i, j);
      // Determine if this is a key: skip ws, check for ':'
      let k = j;
      while (k < s.length && /\s/.test(s[k])) k++;
      const isKey = s[k] === ':';
      const type = isKey ? 'string-key' : 'string-value';
      tokens.push({ type, value: raw, start: i, end: j });
      lastMeaningful = isKey ? 'key' : 'value';
      i = j;
      continue;
    }
    // Number
    if (s[i] === '-' || /\d/.test(s[i])) {
      const m = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(s.slice(i));
      if (m) {
        tokens.push({ type: 'number', value: m[0], start: i, end: i + m[0].length });
        lastMeaningful = 'value';
        i += m[0].length;
        continue;
      }
    }
    // Keywords
    if (s.slice(i, i + 4) === 'true') {
      tokens.push({ type: 'boolean', value: 'true', start: i, end: i + 4 });
      lastMeaningful = 'value';
      i += 4; continue;
    }
    if (s.slice(i, i + 5) === 'false') {
      tokens.push({ type: 'boolean', value: 'false', start: i, end: i + 5 });
      lastMeaningful = 'value';
      i += 5; continue;
    }
    if (s.slice(i, i + 4) === 'null') {
      tokens.push({ type: 'null', value: 'null', start: i, end: i + 4 });
      lastMeaningful = 'value';
      i += 4; continue;
    }
    // Punctuation
    if ('{}[],:'.indexOf(s[i]) !== -1) {
      tokens.push({ type: 'punct', value: s[i], start: i, end: i + 1 });
      lastMeaningful = s[i];
      i++; continue;
    }
    // Unknown character (bad JSON) — emit rest as unknown
    tokens.push({ type: 'unknown', value: s.slice(i), start: i, end: s.length });
    break;
  }
  void lastMeaningful;
  return tokens;
}

/**
 * Build an inline debug block showing the raw JSON with syntax coloring and a caret at the
 * error position. Returns a `<div class="sp-json-error">` DOM element.
 * Uses `doc.createElement` + `textContent` only — no innerHTML with user data.
 */
function spBuildJsonErrorBlock(doc, messageId, errInfo) {
  const { inner, detail, pos } = errInfo || {};
  const text = String(inner || '');

  const wrap = doc.createElement('div');
  wrap.className = 'sp-json-error';
  if (messageId != null) wrap.dataset.spMessageId = String(messageId);

  // Header: error summary
  const hdr = doc.createElement('div');
  hdr.className = 'sp-json-error-hdr';
  const lineNum = typeof errInfo.line === 'number' ? errInfo.line + 1 : '?';
  const colNum = typeof errInfo.col === 'number' ? errInfo.col + 1 : '?';
  hdr.textContent = 'JSON parse error · line ' + lineNum + ', col ' + colNum + ' · ' + String(detail || '');
  wrap.appendChild(hdr);

  // Body: tokenized pre
  const pre = doc.createElement('pre');
  pre.className = 'sp-json-error-body';

  const tokens = spTokenizeJson(text);
  let caretInserted = false;

  for (let t = 0; t < tokens.length; t++) {
    const tok = tokens[t];
    const nextTok = tokens[t + 1];

    // Insert error caret before the token that covers the error position
    if (!caretInserted && pos >= 0 && tok.start >= pos) {
      const caret = doc.createElement('span');
      caret.className = 'sp-json-tok-caret';
      caret.textContent = '▼';
      pre.appendChild(caret);
      caretInserted = true;
    }

    const span = doc.createElement('span');
    span.className = 'sp-json-tok-' + tok.type;
    span.textContent = tok.value;
    pre.appendChild(span);

    // If position falls inside this token, insert caret after the span
    if (!caretInserted && pos >= 0 && tok.start < pos && tok.end >= pos) {
      // Split the token at pos to insert caret mid-token
      // Redo: replace the span we just appended with two halves + caret
      pre.removeChild(span);
      const before = doc.createElement('span');
      before.className = span.className;
      before.textContent = tok.value.slice(0, pos - tok.start);
      const caret = doc.createElement('span');
      caret.className = 'sp-json-tok-caret';
      caret.textContent = '▼';
      const after = doc.createElement('span');
      after.className = span.className;
      after.textContent = tok.value.slice(pos - tok.start);
      pre.appendChild(before);
      pre.appendChild(caret);
      pre.appendChild(after);
      caretInserted = true;
      void nextTok;
      continue;
    }
  }

  // If caret never placed (pos past end or pos === -1), append at end
  if (!caretInserted && pos >= 0) {
    const caret = doc.createElement('span');
    caret.className = 'sp-json-tok-caret';
    caret.textContent = '▼';
    pre.appendChild(caret);
  }

  wrap.appendChild(pre);
  return wrap;
}

/**
 * Hide marker transport blocks in the displayed `.mes_text`.
 * We still parse markers from `row.message` (chat data), but we don't want users to see them.
 * When a parse error is stored for this swipe, inserts an inline debug block instead of
 * leaving the message empty.
 *
 * NOTE: This is DOM-only; it intentionally does not mutate `row.message` or chat files.
 */
function spStripMarkersFromDisplayedMessage(messageId) {
  const textEl = spMesTextElement(messageId);
  if (!textEl) return;
  const html = String(textEl.innerHTML || '');
  if (!html) return;

  // Fetch row once — needed for both payload computation and parse-error check.
  let row = null;
  try { row = spGetMessageRow(messageId); } catch { /* ignore */ }

  const { start: tagS, end: tagE } = spTagPair();

  // Compute the exact marker JSON payload from saved chat text (row.message).
  // ST may strip comment delimiters in rendered HTML, leaving only the bare JSON visible;
  // in that case we still want to remove that JSON from the displayed message.
  let payloads = [];
  try {
    const msg = row && typeof row.message === 'string' ? row.message : '';
    if (msg) {
      const s1 = msg.indexOf(tagS);
      const e1 = msg.lastIndexOf(tagE);
      if (s1 !== -1 && e1 !== -1 && e1 > s1) {
        payloads.push(msg.slice(s1 + tagS.length, e1).trim());
      }
    }
  } catch {
    /* ignore */
  }
  // Normalize payloads (remove duplicates; add compact and markdown-transformed variants).
  // Root-cause note: ST's markdown renderer converts `...` → `…` (U+2026), `--` → `–`/`—`,
  // and DOMPurify strips comment delimiters but keeps the JSON as plain text.  The exact-string
  // removal in spRemoveTextSequenceFromElement fails when these transforms apply, so we add the
  // transformed variants explicitly so the text-node pass can still find and remove them.
  const spMdNormalize = (s) => s
    .replace(/\.\.\./g, '…')   // ... → …
    .replace(/---/g, '—')       // --- → —
    .replace(/--/g, '–');       // -- → –
  const uniq = [];
  const spUniqPush = (s) => { if (s && uniq.indexOf(s) === -1) uniq.push(s); };
  for (const p of payloads) {
    const t = String(p || '').trim();
    if (!t) continue;
    spUniqPush(t);
    spUniqPush(spMdNormalize(t));
    try {
      const compact = JSON.stringify(JSON.parse(t));
      if (compact) {
        spUniqPush(compact);
        spUniqPush(spMdNormalize(compact));
      }
    } catch {
      /* ignore — invalid JSON; still add the normalized raw form above */
    }
  }
  // ST formatting/sanitization sometimes HTML-escapes the tag delimiters, so match both
  // the raw tag pair and its &lt;/&gt;/&amp;-escaped form (built from the configured tag).
  const spReEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const spHtmlEsc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  let next = html
    .replace(new RegExp(spReEsc(tagS) + '[\\s\\S]*?' + spReEsc(tagE), 'gi'), '')
    .replace(new RegExp(spReEsc(spHtmlEsc(tagS)) + '[\\s\\S]*?' + spReEsc(spHtmlEsc(tagE)), 'gi'), '');
  let didHtmlReplace = false;
  if (next !== html) {
    didHtmlReplace = true;
    spWithMutationObserverSuspended(() => {
      textEl.innerHTML = next;
    });
  }

  // If ST stripped the comment markers entirely (or formatting split the payload across nodes),
  // remove the exact JSON payload from the displayed text nodes (markup-preserving).
  if (uniq.length) {
    spWithMutationObserverSuspended(() => {
      for (const p of uniq) {
        spRemoveTextSequenceFromElement(textEl, p);
      }
    });
  }

  // If we changed innerHTML, the payload might still exist in text nodes (e.g. duplicated
  // by formatting); the text-node pass above handles it.
  void didHtmlReplace;

  // Error block: remove stale one, then insert fresh if a parse error is stored for this swipe.
  spRemoveErrorBlockFromTextEl(textEl);
  try {
    const parseErr = row && row.data && typeof row.data === 'object'
      ? row.data[SP_CHAT_PARSE_ERROR_KEY]
      : null;
    if (parseErr && parseErr.inner != null) {
      const doc = chatDoc();
      const errBlock = spBuildJsonErrorBlock(doc, messageId, parseErr);
      spWithMutationObserverSuspended(() => {
        // Insert before the panel mount point (if it exists), otherwise append.
        const panel = textEl.querySelector(':scope > .sp-block-root');
        if (panel) textEl.insertBefore(errBlock, panel);
        else textEl.appendChild(errBlock);
      });
    }
  } catch (e) {
    console.error('[status-panel] spBuildJsonErrorBlock failed', e);
  }
}

/**
 * Two token forms per field (S14):
 *   `{{name}}` = the field's NAME (a static label) — always shown as-is (escaped).
 *   `{name}`   = the field's live stored VALUE. Empty/missing → a muted dash placeholder
 *                (S5): the panel never shows a field's 示例值 as if it were real data.
 * The label pass runs FIRST and fully consumes every `{{name}}`, so the value pass can never
 * mistake a `{{name}}` for a `{name}` (which would otherwise leave stray braces around the value).
 */
function spInterpolateTemplate(template, values, fields, opts) {
  const preEscapedLive = opts && opts.preEscapedLiveValues === true;
  /** Inside `<style>` bodies: never emit HTML placeholder spans (breaks CSS / scoping). */
  const plainTextPlaceholders = opts && opts.plainTextPlaceholders === true;
  let html = template || '';
  // Label pass (S14): `{{name}}` → the field's name. Before the value pass; escaped for safety.
  for (const f of fields || []) {
    const name = String(f.name || '').trim();
    if (!name) continue;
    html = html.split('{{' + name + '}}').join(esc(name));
  }
  // Value pass: `{name}` → live stored value.
  for (const f of fields || []) {
    const name = String(f.name || '').trim();
    if (!name) continue;
    const raw = values[name];
    const isEmpty = raw === undefined || raw === null || raw === '';
    let live;
    if (isEmpty) {
      live = plainTextPlaceholders
        ? '—'
        : '<span class="sp-ph sp-ph-dash" aria-hidden="true">—</span>';
    } else {
      live = preEscapedLive ? String(raw) : esc(String(raw));
    }
    html = html.split('{' + name + '}').join(live);
  }
  return html;
}

/** Reserved `{sp_badge}` expansion; unknown/null sources yield empty string. */
function spBuildBadgeHtml(source) {
  if (source == null || source === '') return '';
  const s = String(source);
  if (s === 'markers') return '<span class="sp-badge">来自回复</span>';
  if (s === 'auto') return '<span class="sp-badge">已生成</span>';
  if (s === 'manual') return '<span class="sp-badge">手动</span>';
  if (s === 'error') return '<span class="sp-badge sp-badge-error">生成失败</span>';
  return '';
}

function spBuildIframeSrcdoc(cfg, values, meta) {
  const safeValues = {};
  for (const k of Object.keys(values || {})) {
    safeValues[k] = spEscapeHtml(values[k]);
  }
  const fields = cfg.fields;
  let tpl = cfg.htmlTemplate || '';

  // Extract embedded `<style>` bodies before interpolating field values so message text
  // can never inject `</style>`, `}`, quotes, or HTML into the stylesheet (freeze / corrupt CSS).
  const embeddedStyleBodies = [];
  tpl = tpl.replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gi, (_m, content) => {
    embeddedStyleBodies.push(content || '');
    return '';
  });
  const embeddedFromTemplate = embeddedStyleBodies.join('\n');
  const embeddedInterpolated = embeddedFromTemplate.trim()
    ? spInterpolateTemplate(embeddedFromTemplate, safeValues, fields, {
        preEscapedLiveValues: true,
        plainTextPlaceholders: true,
      })
    : '';

  let html = spInterpolateTemplate(tpl, safeValues, fields, {
    preEscapedLiveValues: true,
  });
  // Per-card theme → CSS variables consumed by SP_IFRAME_GLOBAL_CSS. Unset colour knobs
  // ('' from spLayoutTheme) fall back to accent-derived defaults here, so the global
  // sheet stays value-free (S6).
  const th = spLayoutTheme(cfg);
  const varBlock = spBuildThemeVarBlock(th);
  // {sp_actions} = 重试 + 编辑 (S10). 按钮折叠 wraps them behind a ⋯ chip.
  const actionsHtml = th.buttonsCollapsed
    ? '<div class="sp-actions-fold"><button type="button" class="sp-fold-toggle" aria-label="操作">⋯</button>' +
        SP_DEFAULT_ACTIONS_HTML + '</div>'
    : SP_DEFAULT_ACTIONS_HTML;
  html = html.split('{sp_actions}').join(actionsHtml);
  const badgeSrc = meta && meta.source != null ? meta.source : '';
  html = html.split('{sp_badge}').join(spBuildBadgeHtml(badgeSrc));

  const extracted = spExtractEmbeddedStyles(html, { keepScripts: true });
  const bodyInner = extracted.html.trim();
  const wrapped = '<div class="sp-iframe-root">' + bodyInner + '</div>';
  const extraCssMerged = [embeddedInterpolated, extracted.extraCss].filter(Boolean).join('\n');
  const scoped = spIframeAuthorStyleText(cfg.css, extraCssMerged);
  // @import (web fonts) is only valid before all other rules of ITS OWN stylesheet —
  // the reset/global rules below would invalidate it, so imports get a dedicated <style>.
  const importRules = [];
  const scopedRest = scoped.replace(/@import\b[^;]*;/g, (m) => {
    importRules.push(m);
    return '';
  });
  return (
    '<!DOCTYPE html>\n' +
    '<html>\n' +
    '<head>\n' +
    '<meta charset="utf-8">\n' +
    (importRules.length ? '<style>\n' + importRules.join('\n') + '\n</style>\n' : '') +
    // Engine-owned: reset + per-card theme vars + global panel sheet. Author CSS follows
    // in its own <style> and wins on conflict (scoped, later source order).
    '<style>\n' +
    '*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}\n' +
    'html,body{overflow:hidden;}\n' +
    varBlock + '\n' +
    SP_IFRAME_GLOBAL_CSS +
    '\n</style>\n' +
    '<style>\n' +
    scopedRest +
    '\n</style>\n' +
    '</head>\n' +
    '<body>\n' +
    wrapped +
    '\n' +
    SP_IFRAME_BRIDGE +
    '\n</body>\n' +
    '</html>'
  );
}

/** `:root` custom-property block from a sanitized theme; '' knobs resolve to accent-derived defaults. */
function spBuildThemeVarBlock(t) {
  const accent = t.accent || SP_THEME_DEFAULTS.accent;
  const titleColor = t.headerColor || accent;
  const borderColor = t.borderColor || ('color-mix(in srgb, ' + accent + ' 42%, transparent)');
  const textColor = t.textColor || 'rgba(255,255,255,.92)';
  const btnColor = t.btnColor || ('color-mix(in srgb, ' + accent + ' 14%, transparent)');
  const btnBorderColor = t.btnBorderColor || ('color-mix(in srgb, ' + accent + ' 40%, transparent)');
  const btnTextColor = t.btnTextColor || 'inherit';
  const fontStack = spThemeFontStack(t);
  return (
    ':root{' +
    '--sp-accent:' + accent + ';' +
    '--sp-radius:' + t.radius + 'px;' +
    '--sp-text-size:' + t.textSize + 'px;' +
    '--sp-text-color:' + textColor + ';' +
    '--sp-title-color:' + titleColor + ';' +
    '--sp-border-color:' + borderColor + ';' +
    '--sp-btn-color:' + btnColor + ';' +
    '--sp-btn-border-color:' + btnBorderColor + ';' +
    '--sp-btn-text-color:' + btnTextColor + ';' +
    '--sp-font:' + fontStack + ';' +
    '}'
  );
}

function spStripPanelsExcept(keepMessageId) {
  const doc = chatDoc();
  const mesNodes = doc.querySelectorAll('#chat .mes[is_user="false"]');
  mesNodes.forEach((mes) => {
    const mid = mes.getAttribute('mesid');
    if (mid == null || mid === '') return;
    const id = Number(mid);
    if (id === keepMessageId) return;
    const textEl = mes.querySelector('.mes_text');
    spRemovePanelFromTextEl(textEl);
  });
}

async function spRetry(messageId) {
  // No persisted pending state: runStatusGeneration broadcasts sp-state to the mounted
  // iframe (retry button shows …) and writes auto/error when done.
  await runStatusGeneration(messageId);
  renderPanelForMessage(messageId);
}

/** Coalesce repeated render requests per message (same macrotask / burst). */
const spRenderPanelTimers = Object.create(null);

/**
 * Heavy path: remove old panel, build srcdoc, append — must not run in ST's edit/save stack.
 * @see renderPanelForMessage
 */
function spRenderPanelForMessageNow(messageId) {
  const cfg = effectiveConfig();
  const row = spGetMessageRow(messageId);
  if (!row || row.role !== 'assistant') return;

  const textEl = spMesTextElement(messageId);
  if (!textEl) return;

  const lastAssistant = spLastAssistantMesId();
  if (cfg.renderMode === 'last_only' && lastAssistant !== null && messageId !== lastAssistant) {
    return;
  }

  if (!cfg.htmlTemplate || !cfg.htmlTemplate.trim()) return;

  spRemovePanelFromTextEl(textEl);

  const st = spGetMessageStatus(row);
  const values = st && typeof st.values === 'object' ? st.values : {};
  const source = st ? String(st.source || '') : '';

  // If a parse error is recorded and there are no persisted values for this swipe,
  // the inline debug block (mounted by spStripMarkersFromDisplayedMessage) is the UI —
  // skip mounting an empty iframe panel on top of it.
  const parseErr = row && row.data && typeof row.data === 'object'
    ? row.data[SP_CHAT_PARSE_ERROR_KEY]
    : null;
  if (parseErr && parseErr.inner != null && Object.keys(values).length === 0) return;

  const doc = chatDoc();
  const wrap = doc.createElement('div');
  wrap.className = 'sp-block-root';
  wrap.dataset.spMessageId = String(messageId);

  const inner = doc.createElement('div');
  inner.className = 'sp-block-shell';
  let srcdoc;
  try {
    srcdoc = spBuildIframeSrcdoc(cfg, values, { source: source || undefined });
  } catch (e) {
    console.error('[status-panel] spBuildIframeSrcdoc failed', e);
    srcdoc =
      '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><div class="sp-iframe-root">' +
      '<p style="font:12px system-ui;opacity:.75">状态面板渲染失败（已跳过 iframe）。</p></div></body></html>';
  }
  spMountIframe(inner, srcdoc);

  wrap.appendChild(inner);

  if (source === 'error') {
    const ph = doc.createElement('div');
    ph.className = 'sp-placeholder sp-placeholder-error';
    const reason = st && st.error ? String(st.error) : '';
    ph.textContent = SP_UI_TEXT.generationFailed + (reason ? '：' + reason : '');
    wrap.insertBefore(ph, wrap.firstChild);
  } else if (source === 'manual' && (!values || Object.keys(values).length === 0)) {
    const ph = doc.createElement('div');
    ph.className = 'sp-placeholder';
    ph.textContent = SP_UI_TEXT.noMarkersManual;
    wrap.insertBefore(ph, wrap.firstChild);
  }

  textEl.appendChild(wrap);
}

function renderPanelForMessage(messageId) {
  const cfg = effectiveConfig();
  const row = spGetMessageRow(messageId);
  if (!row || row.role !== 'assistant') return;

  const textEl = spMesTextElement(messageId);
  if (!textEl) return;

  const lastAssistant = spLastAssistantMesId();
  if (cfg.renderMode === 'last_only' && lastAssistant !== null && messageId !== lastAssistant) {
    return;
  }

  if (!cfg.htmlTemplate || !cfg.htmlTemplate.trim()) return;

  const k = String(messageId);
  if (spRenderPanelTimers[k]) clearTimeout(spRenderPanelTimers[k]);
  spRenderPanelTimers[k] = setTimeout(() => {
    delete spRenderPanelTimers[k];
    try {
      spRenderPanelForMessageNow(messageId);
    } catch (e) {
      console.error('[status-panel] spRenderPanelForMessageNow failed', e);
    }
  }, 0);
}

/**
 * Consent banner: the current card carries a panel definition the user hasn't
 * approved yet (same pattern as ST's scoped-regex approval). Idempotent.
 */
function spSyncConsentBanner() {
  const doc = chatDoc();
  const existing = doc.getElementById(SP_CONSENT_ID);
  if (spPanelState() !== 'consent') {
    if (existing) existing.remove();
    return;
  }
  if (existing) return;
  const chat = doc.querySelector('#chat');
  if (!chat) return;
  const bar = doc.createElement('div');
  bar.id = SP_CONSENT_ID;
  bar.className = 'sp-consent-bar';
  bar.innerHTML =
    '<span class="sp-consent-text">此角色卡自带状态栏设计。是否为该角色启用？</span>' +
    '<span class="sp-consent-actions">' +
    '<button type="button" class="sp-btn" data-sp-consent="allow">启用</button>' +
    '<button type="button" class="sp-btn" data-sp-consent="dismiss">暂不</button>' +
    '</span>';
  bar.querySelector('[data-sp-consent="allow"]').addEventListener('click', () => {
    spAllowCharacter();
    bar.remove();
    refreshAllAssistantPanels();
    spToast('已为此角色启用状态栏', '状态面板');
  });
  bar.querySelector('[data-sp-consent="dismiss"]').addEventListener('click', () => {
    spDismissCharacter();
    bar.remove();
  });
  chat.appendChild(bar);
}

/**
 * Chinese onboarding card: panel enabled but the definition is still missing
 * fields and/or a template. Replaces the old "default character design" —
 * the engine never invents a layout without the author asking for one.
 * Idempotent; rebuilds only when the remaining step changes.
 */
function spSyncGuidanceCard() {
  const doc = chatDoc();
  const existing = doc.getElementById(SP_GUIDANCE_ID);
  if (!spPanelEnabled()) {
    if (existing) existing.remove();
    return;
  }
  const cfg = effectiveConfig();
  const noFields = (cfg.fields || []).length === 0;
  const noTemplate = !(cfg.htmlTemplate || '').trim();
  if (!noFields && !noTemplate) {
    if (existing) existing.remove();
    return;
  }
  const step = noFields ? 'fields' : 'styles';
  if (existing && existing.dataset.spStep === step) return;
  if (existing) existing.remove();

  const chat = doc.querySelector('#chat');
  if (!chat) return;

  const card = doc.createElement('div');
  card.id = SP_GUIDANCE_ID;
  card.className = 'sp-consent-bar sp-guidance-card';
  card.dataset.spStep = step;

  const stepText = noFields
    ? '先加字段（如 心情、好感度），再生成或粘贴排版。'
    : '字段已就绪，还差生成或粘贴排版。';
  const quickBtn = noFields
    ? '<button type="button" class="sp-btn" data-sp-guide="quick">一键使用示例（字段 + 排版）</button>'
    : '<button type="button" class="sp-btn" data-sp-guide="genlayout">生成默认排版</button>';
  card.innerHTML =
    '<span class="sp-consent-text"><strong>状态栏已开启，但面板还是空的。</strong><br>' +
    esc(stepText) + '</span>' +
    '<span class="sp-consent-actions">' +
    quickBtn +
    '<button type="button" class="sp-btn" data-sp-guide="fields">字段设置</button>' +
    '<button type="button" class="sp-btn" data-sp-guide="styles">样式设置</button>' +
    '</span>';

  card.querySelectorAll('[data-sp-guide]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const act = btn.getAttribute('data-sp-guide');
      if (act === 'fields' || act === 'styles') {
        if (typeof window.__spOpenPanel === 'function') window.__spOpenPanel(act);
        return;
      }
      void (async () => {
        try {
          if (act === 'quick') {
            const fields = SP_SAMPLE_FIELDS.map((f) => ({ ...f }));
            const html = spGenerateLayoutHtml(fields, spLayoutTheme(effectiveConfig()));
            await spCharDefSave({ fields, htmlTemplate: html, designMode: 'simple' });
            spToast('已创建示例字段和默认排版', '状态面板');
          } else if (act === 'genlayout') {
            const cur = effectiveConfig();
            const html = spGenerateLayoutHtml(cur.fields || [], spLayoutTheme(cur));
            await spCharDefSave({ htmlTemplate: html, designMode: 'simple' });
            spToast('已生成默认排版', '状态面板');
          }
          refreshAllAssistantPanels();
        } catch (e) {
          log('guidance quick action failed', e);
          spToast(String(e && e.message ? e.message : e), '状态面板');
        }
      })();
    });
  });

  chat.appendChild(card);
}

/**
 * Path A of v3 (S1/S2): keep the main-generation status instruction in sync via
 * ctx.setExtensionPrompt. Injection is ON whenever the panel is enabled and has
 * fields — there is no toggle. Depth + role come from engine settings (depth 0 =
 * bottom of the assembled prompt). Publishing '' clears the slot on disable/switch.
 * Idempotent; called from every refreshAllAssistantPanels.
 */
function spSyncExtensionPrompt() {
  try {
    const ctx = spGetSTContext();
    if (!ctx || typeof ctx.setExtensionPrompt !== 'function') return;
    let content = '';
    const cfg = effectiveConfig();
    if (spPanelEnabled() && (cfg.fields || []).length > 0) {
      content = spBuildFullPromptContent(cfg);
    }
    const types = ctx.extension_prompt_types || {};
    const roles = ctx.extension_prompt_roles || {};
    const pos = typeof types.IN_CHAT === 'number' ? types.IN_CHAT : 1;
    const eng = spEngineLoad();
    const roleName = eng.defaultPromptRole === 'user' ? 'USER'
      : eng.defaultPromptRole === 'assistant' ? 'ASSISTANT' : 'SYSTEM';
    const role = typeof roles[roleName] === 'number' ? roles[roleName]
      : (typeof roles.SYSTEM === 'number' ? roles.SYSTEM : 0);
    const cfgDepth = Number(eng.defaultPromptInChatDepth);
    const depth = Number.isFinite(cfgDepth) ? Math.max(0, Math.min(999, cfgDepth)) : 0;
    ctx.setExtensionPrompt(SP_EXT_PROMPT_KEY, content, pos, depth, false, role);
  } catch (e) {
    log('spSyncExtensionPrompt failed', e);
  }
}

function refreshAllAssistantPanels() {
  spSyncConsentBanner();
  spSyncExtensionPrompt();
  spSyncGuidanceCard();
  if (!spPanelEnabled()) {
    // Engine idle for this chat (no definition / not approved): leave nothing mounted.
    chatDoc().querySelectorAll('.sp-block-root').forEach((el) => el.remove());
    return;
  }
  spWithMutationObserverSuspended(() => {
    const doc = chatDoc();
    const mesNodes = doc.querySelectorAll('#chat .mes[is_user="false"]');
    const cfg = effectiveConfig();
    const last = cfg.renderMode === 'last_only' ? spLastAssistantMesId() : null;

    mesNodes.forEach((mes) => {
      const mid = mes.getAttribute('mesid');
      if (mid == null || mid === '') return;
      const id = Number(mid);
      if (cfg.renderMode === 'last_only' && last !== null && id !== last) return;
      spStripMarkersFromDisplayedMessage(id);
      renderPanelForMessage(id);
      // Author-prefilled status blocks (e.g. pasted into a greeting) reach the chat
      // without any generation event, so the refresh path must also lift markers into
      // stored values. Free (never calls generateRaw) and markerSig-deduped, so
      // repeated refreshes are no-op writes.
      spSyncMarkersOnlyForMessage(id)
        .then((wrote) => {
          if (wrote) renderPanelForMessage(id);
        })
        .catch((e) => log('refresh marker sync failed', id, e));
    });

    if (cfg.renderMode === 'last_only' && last !== null) spStripPanelsExcept(last);
  });
}

/**
 * @param {number} messageId
 * @param {{ afterManualEdit?: boolean }} [options] When true (MESSAGE_UPDATED): merge marker JSON into
 *   message `data` only — do not mount the in-chat iframe. ST reformats the whole `.mes_text` on edit
 *   save; re-rendering the panel there freezes the tab. API paths call without this flag.
 */
async function onCharacterMessageRendered(messageId, options) {
  const cfg = effectiveConfig();
  const afterEdit = options && options.afterManualEdit === true;
  await spSyncStatusPanelForAssistantMessage(messageId, afterEdit ? { afterManualEdit: true } : {});
  if (afterEdit) {
    const textEl = spMesTextElement(messageId);
    if (textEl) spRemovePanelFromTextEl(textEl);
    return;
  }
  // Normal render path: hide marker transport then mount the panel.
  spStripMarkersFromDisplayedMessage(messageId);
  renderPanelForMessage(messageId);
  if (cfg.renderMode === 'last_only') {
    const last = spLastAssistantMesId();
    if (last !== null) spStripPanelsExcept(last);
  }
}

/**
 * First-parse adoption: a JSON status block arrived while the definition has no
 * fields — treat the block as the schema. Creates one field per key (number vs text
 * inferred from the JSON value; the block value becomes the field default) and, when
 * the template is also empty, generates the default 简易 layout so the panel is
 * immediately usable. Never runs once the author has defined any field, so it cannot
 * clobber a hand-built schema.
 */
async function spAdoptFieldsFromParsedBlock(rawValue) {
  try {
    const cur = effectiveConfig();
    if ((cur.fields || []).length > 0) return false;
    const obj = spStripInternalKeys(rawValue);
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
    const fields = Object.keys(obj).map((k) => {
      const v = obj[k];
      return typeof v === 'number' && Number.isFinite(v)
        ? { name: k, type: 'number', value: v, hint: '' }
        : { name: k, type: 'text', value: String(v == null ? '' : v), hint: '' };
    });
    if (!fields.length) return false;
    // The adopted block values become each field's 示例值 (S4), shown — clearly labelled
    // 示例「X」 — in the injected field-rules list. The output-block itself uses placeholders.
    const patch = { fields };
    const hasTemplate = !!(cur.htmlTemplate || '').trim();
    if (!hasTemplate) {
      patch.htmlTemplate = spGenerateLayoutHtml(fields, spLayoutTheme(cur));
      patch.designMode = 'simple';
    }
    await spCharDefSave(patch);
    spToast(
      '已根据状态块自动创建 ' + fields.length + ' 个字段' + (hasTemplate ? '' : '，并生成默认排版'),
      '状态面板',
    );
    // The guidance card may still show "add fields"; a full refresh clears it and
    // mounts the new panel. Deferred so the current sync finishes storing values first.
    setTimeout(() => {
      try {
        refreshAllAssistantPanels();
        // If the settings window is open, re-render so the 字段 tab shows the adopted
        // fields immediately (was: user had to switch tabs and back).
        const doc = chatDoc();
        const panel = doc.getElementById(SP_PANEL_ID);
        if (panel && panel.classList.contains('sp-panel-open') && typeof renderPanelContent === 'function') {
          renderPanelContent();
        }
      } catch (e) { log('post-adopt refresh failed', e); }
    }, 0);
    return true;
  } catch (e) {
    log('spAdoptFieldsFromParsedBlock failed', e);
    return false;
  }
}

async function spSyncStatusPanelForAssistantMessage(messageId, options) {
  await spWithPerMessageAsyncChain(messageId, () =>
    spSyncStatusPanelForAssistantMessageCore(messageId, options || {}),
  );
}

async function spSyncStatusPanelForAssistantMessageCore(messageId, options) {
  // Opt-in guarantee: no enabled definition for this character → no writes, no API calls.
  if (!spPanelEnabled()) return;
  const row = spGetMessageRow(messageId);
  if (!row || row.role !== 'assistant') return;

  const cfg = effectiveConfig();
  const force = options.force === true;
  const editSave = options.afterManualEdit === true;
  const now = Date.now();

  // In last_only render mode, skip generation for non-last messages entirely.
  // CHARACTER_MESSAGE_RENDERED can fire for multiple messages; without this guard
  // each old message without stored data would trigger a concurrent generateRaw call.
  // MESSAGE_UPDATED (edit save) opts in via `afterManualEdit` so marker JSON is still merged
  // into `data` for the edited row without using full `force` (which would bypass regen guards).
  if (!force && !editSave && cfg.renderMode === 'last_only') {
    const last = spLastAssistantMesId();
    if (last !== null && messageId !== last) return;
  }

  const text = row.message || '';

  // Message text is empty — the main API hasn't delivered content yet (streaming not started
  // or MESSAGE_RECEIVED hasn't fired). Skip auto fallback; wait for the next event.
  if (!text.trim()) return;

  // Prerequisite: check if the main API message already embeds a valid status block.
  // If found, parse and store it — no secondary generateRaw call needed.
  const parsed = extractStatusFromMessage(text, cfg);
  if (parsed.ok) {
    // Author wrote a JSON block before defining any fields → the block IS the schema.
    let cfgNow = cfg;
    if ((cfgNow.fields || []).length === 0 && (await spAdoptFieldsFromParsedBlock(parsed.value))) {
      cfgNow = effectiveConfig();
    }
    const values = spNormalizeValuesFromParsed(spStripInternalKeys(parsed.value), cfgNow.fields);
    // Markers are transport; don't let a stale unchanged marker block clobber newer generated data.
    // We only overwrite stored data when the marker JSON *content* changed (signature differs).
    const sig = spMarkerSig(parsed.value, cfgNow.fields);
    const prevMeta = row && row.data && typeof row.data === 'object' ? row.data[SP_CHAT_META_KEY] : null;
    const prevSig = prevMeta && typeof prevMeta === 'object' ? prevMeta.markerSig : null;
    if (prevSig && prevSig === sig) return;

    await spMergeChatMessageData(messageId, (prev) => {
      const next = {
        ...prev,
        [SP_CHAT_STATUS_KEY]: {
          values,
          source: 'markers',
        },
        [SP_CHAT_META_KEY]: {
          ...(prev && typeof prev === 'object' && prev[SP_CHAT_META_KEY] && typeof prev[SP_CHAT_META_KEY] === 'object'
            ? prev[SP_CHAT_META_KEY]
            : {}),
          updatedAt: now,
          markerUpdatedAt: now,
          markerSig: sig,
        },
      };
      // Clear any stale parse error from a previous bad-JSON visit of this swipe.
      delete next[SP_CHAT_PARSE_ERROR_KEY];
      return next;
    });
    return;
  }

  // No embedded status block. v3 has no auto/fallback generation (S1): the panel
  // stays empty until the reply carries a block or the user clicks 重试. Nothing to do.
}

/**
 * Marker-only sync used by MESSAGE_SWIPED and the full-refresh path.
 * Parses markers from the currently active swipe and persists them (or records a parse error).
 * Never triggers generateRaw, even in auto mode — avoids surprise API spend on swipe navigation.
 * Respects last_only: non-last assistant messages are skipped.
 * Resolves `true` when it wrote message data (caller should re-render), `false`/undefined otherwise.
 */
async function spSyncMarkersOnlyForMessage(messageId) {
  return spWithPerMessageAsyncChain(messageId, async () => {
    const row = spGetMessageRow(messageId);
    if (!row || row.role !== 'assistant') return false;

    const cfg = effectiveConfig();
    const last = spLastAssistantMesId();
    if (cfg.renderMode === 'last_only' && last !== null && messageId !== last) return false;

    const text = row.message || '';
    if (!text.trim()) return false;

    const now = Date.now();
    const parsed = extractStatusFromMessage(text, cfg);

    if (parsed.ok) {
      // Author wrote a JSON block before defining any fields → the block IS the schema.
      let cfgNow = cfg;
      if ((cfgNow.fields || []).length === 0 && (await spAdoptFieldsFromParsedBlock(parsed.value))) {
        cfgNow = effectiveConfig();
      }
      // Valid markers — clear any stored parse error, merge values.
      const values = spNormalizeValuesFromParsed(spStripInternalKeys(parsed.value), cfgNow.fields);
      const sig = spMarkerSig(parsed.value, cfgNow.fields);
      const prevMeta = row.data && typeof row.data === 'object' ? row.data[SP_CHAT_META_KEY] : null;
      const prevSig = prevMeta && typeof prevMeta === 'object' ? prevMeta.markerSig : null;
      // If signature matches what's already stored, no write needed — avoid unnecessary setChatMessages.
      if (prevSig && prevSig === sig) {
        // Still clear any stale parse error from a previous bad swipe visit.
        const hasParseErr = row.data && typeof row.data === 'object' && row.data[SP_CHAT_PARSE_ERROR_KEY];
        if (!hasParseErr) return false;
      }
      await spMergeChatMessageData(messageId, (prev) => {
        const next = {
          ...prev,
          [SP_CHAT_STATUS_KEY]: { values, source: 'markers' },
          [SP_CHAT_META_KEY]: {
            ...(prev && typeof prev === 'object' && prev[SP_CHAT_META_KEY] && typeof prev[SP_CHAT_META_KEY] === 'object'
              ? prev[SP_CHAT_META_KEY]
              : {}),
            updatedAt: now,
            markerUpdatedAt: now,
            markerSig: sig,
          },
        };
        // Clear stale parse error on success.
        delete next[SP_CHAT_PARSE_ERROR_KEY];
        return next;
      });
      return true;
    }

    if (parsed.error === 'markers_missing') {
      // No markers on this swipe — render whatever data is persisted; nothing to write.
      return false;
    }

    // json_parse: markers found but JSON is invalid — store error info for the debug renderer.
    // Don't overwrite existing valid status values if they exist.
    await spMergeChatMessageData(messageId, (prev) => ({
      ...prev,
      [SP_CHAT_PARSE_ERROR_KEY]: {
        inner: parsed.inner,
        detail: parsed.detail,
        pos: parsed.pos,
        line: parsed.line,
        col: parsed.col,
        at: now,
      },
    }));
    return true;
  });
}

async function onMessageReceivedCapture(messageId) {
  await spSyncStatusPanelForAssistantMessage(messageId, {});
  renderPanelForMessage(messageId);
}

function spClearPendingPanelRenders() {
  for (const k of Object.keys(spRenderPanelTimers)) {
    const t = spRenderPanelTimers[k];
    if (t) clearTimeout(t);
    delete spRenderPanelTimers[k];
  }
}
if (typeof spAddDisposer === 'function') spAddDisposer(spClearPendingPanelRenders);

// ─── Floating settings panel (字段 / 样式 / 生成 / 管理) ─────────────────────

let spCurrentTab = 'fields';
let spPanelDragBound = false;

function ensurePanelShell() {
  const doc = chatDoc();
  if (doc.getElementById(SP_PANEL_ID)) return;

  const panel = doc.createElement('div');
  panel.id = SP_PANEL_ID;
  panel.innerHTML = `
    <div class="sp-panel-header" id="sp-panel-header">
      <span class="sp-panel-title">状态面板</span>
      <button type="button" class="sp-panel-close" id="sp-panel-close" title="关闭">✕</button>
    </div>
    <div class="sp-tabs" id="sp-tabs"></div>
    <div class="sp-panel-body" id="sp-panel-body"></div>
  `;
  doc.body.appendChild(panel);

  // Stop all pointer/touch events inside the panel from bubbling to ST's document-level
  // handlers (e.g. QR2 auto-execute which fires on every click reaching the document).
  ['click', 'mousedown', 'pointerdown', 'touchstart'].forEach((type) => {
    panel.addEventListener(type, (e) => e.stopPropagation(), type === 'touchstart' ? { passive: true } : undefined);
  });

  doc.getElementById('sp-panel-close').addEventListener('click', () => closePanel());

  if (!spPanelDragBound) {
    spPanelDragBound = true;
    bindPanelHeaderDrag(doc.getElementById('sp-panel-header'), panel);
  }
}

function bindPanelHeaderDrag(headerEl, panelEl) {
  if (!headerEl || !panelEl) return;

  function startDrag(startX, startY) {
    const doc = chatDoc();
    const r = panelEl.getBoundingClientRect();
    const startLeft = r.left;
    const startTop = r.top;
    let moved = false;
    const vw = () => (window.parent && window.parent !== window ? window.parent.innerWidth : window.innerWidth);
    const vh = () => (window.parent && window.parent !== window ? window.parent.innerHeight : window.innerHeight);

    function getXY(ev) {
      if (ev.touches && ev.touches.length) return { x: ev.touches[0].clientX, y: ev.touches[0].clientY };
      return { x: ev.clientX, y: ev.clientY };
    }
    function onMove(ev) {
      const { x, y } = getXY(ev);
      const dx = x - startX;
      const dy = y - startY;
      if (!moved && (Math.abs(dx) > 2 || Math.abs(dy) > 2)) moved = true;
      if (!moved) return;
      if (ev.cancelable) ev.preventDefault();
      const margin = 8;
      const w = panelEl.offsetWidth;
      const h = panelEl.offsetHeight;
      const left = Math.min(Math.max(margin, startLeft + dx), vw() - w - margin);
      const top = Math.min(Math.max(margin, startTop + dy), vh() - h - margin);
      panelEl.style.setProperty('left', left + 'px', 'important');
      panelEl.style.setProperty('top', top + 'px', 'important');
      panelEl.style.setProperty('right', 'auto', 'important');
      panelEl.style.setProperty('bottom', 'auto', 'important');
    }
    function onUp() {
      doc.removeEventListener('mousemove', onMove);
      doc.removeEventListener('mouseup', onUp);
      doc.removeEventListener('touchmove', onMove);
      doc.removeEventListener('touchend', onUp);
      try { window.removeEventListener('mouseup', onUp); } catch { /* cross-origin */ }
      if (moved) {
        const t = parseFloat(panelEl.style.top) || 0;
        const l = parseFloat(panelEl.style.left) || 0;
        panelPosSave(t, l);
      }
    }
    doc.addEventListener('mousemove', onMove);
    doc.addEventListener('mouseup', onUp);
    doc.addEventListener('touchmove', onMove, { passive: false });
    doc.addEventListener('touchend', onUp);
    try { window.addEventListener('mouseup', onUp); } catch { /* cross-origin */ }
  }

  headerEl.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    // Skip all interactive elements — only bare header space starts a drag
    if (e.target.closest && e.target.closest('button, a, input, select, textarea')) return;
    startDrag(e.clientX, e.clientY);
  });

  headerEl.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;
    if (e.target.closest && e.target.closest('button, a, input, select, textarea')) return;
    startDrag(e.touches[0].clientX, e.touches[0].clientY);
  }, { passive: true });
}

function renderTabButtons() {
  const doc = chatDoc();
  const tabs = doc.getElementById('sp-tabs');
  if (!tabs) return;
  const order = [
    { id: 'fields', label: '字段' },
    { id: 'styles', label: '样式' },
    { id: 'generate', label: '生成' },
    { id: 'manage', label: '管理' },
  ];
  tabs.innerHTML = order
    .map(
      (t) =>
        `<button type="button" class="sp-tab ${spCurrentTab === t.id ? 'sp-tab-active' : ''}" data-sp-tab="${t.id}">${esc(t.label)}</button>`,
    )
    .join('');
  tabs.querySelectorAll('[data-sp-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      spCurrentTab = btn.getAttribute('data-sp-tab') || 'fields';
      renderPanelContent();
    });
  });
}

function renderPanelContent() {
  const doc = chatDoc();
  const body = doc.getElementById('sp-panel-body');
  if (!body) return;
  const cfg = effectiveConfig();

  if (spCurrentTab === 'fields') {
    body.innerHTML = spRenderFieldsTab(cfg);
    spBindFieldsTab();
  } else if (spCurrentTab === 'styles') {
    body.innerHTML = spRenderStylesTab(cfg);
    spBindStylesTab(cfg);
  } else if (spCurrentTab === 'generate') {
    body.innerHTML = spRenderGenerateTab(cfg);
    spBindGenerateTab();
  } else {
    body.innerHTML = spRenderManageTab();
    spBindManageTab();
  }
  renderTabButtons();
}

/** Options for OpenAI-style model dropdown (populated via TavernHelper.getModelList). */
function spApiModelSelectInnerHtml(cfg, fetchedList) {
  const cur = String(cfg.apiOpenaiModel || '').trim();
  const list = Array.isArray(fetchedList) ? fetchedList : [];
  const parts = ['<option value="">— 选择模型 —</option>'];
  const seen = new Set();
  for (const m of list) {
    const id = String(m).trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    parts.push(`<option value="${esc(id)}"${id === cur ? ' selected' : ''}>${esc(id)}</option>`);
  }
  if (cur && !seen.has(cur)) {
    parts.push(`<option value="${esc(cur)}" selected>${esc(cur)} （已保存）</option>`);
  }
  return parts.join('');
}

/** Datalist options: only field names are interpolated into templates / JSON schema for the model. */
function spFieldMetaText(f) {
  const isNum = f.type === 'number';
  const isEnum = f.type === 'enum';
  const defS = isNum
    ? String(Number.isFinite(Number(f.value)) ? Number(f.value) : 0)
    : String(f.value ?? '');
  let meta = isNum ? 'number' : isEnum ? 'enum' : 'text';
  if (isEnum) {
    const opts = typeof spFieldEnumOptions === 'function' ? spFieldEnumOptions(f) : [];
    if (opts.length) meta += ` · ${opts.length} 个选项`;
  } else {
    meta += ` · 示例：${defS || '（空）'}`;
  }
  if (isNum) {
    const lo = Number(f.min);
    const hi = Number(f.max);
    if (Number.isFinite(lo) && Number.isFinite(hi)) meta += ` · 范围 ${lo}–${hi}`;
    else if (Number.isFinite(lo)) meta += ` · 最小 ${lo}`;
    else if (Number.isFinite(hi)) meta += ` · 最大 ${hi}`;
  }
  return meta;
}

function spLiveTokenDatalistHtml(fields) {
  const parts = [];
  for (const f of fields || []) {
    const n = String(f.name || '').trim();
    if (!n) continue;
    const tok = '{' + n + '}';
    parts.push(`<option value="${esc(tok)}">${esc(tok + ' — 消息值 · ' + spFieldMetaText(f))}</option>`);
  }
  return parts.join('');
}

function spFieldCardHtml(f, i) {
  const type = f.type === 'number' ? 'number' : f.type === 'enum' ? 'enum' : 'text';
  const isNum = type === 'number';
  const isEnum = type === 'enum';
  const minV = f.min !== undefined && f.min !== null && f.min !== '' ? String(f.min) : '';
  const maxV = f.max !== undefined && f.max !== null && f.max !== '' ? String(f.max) : '';
  const defVal = String(f.value ?? '');
  const valInputType = isNum ? 'number' : 'text';
  const rangeDisplay = isNum ? '' : 'display:none';
  const optsDisplay = isEnum ? '' : 'display:none';
  const optsText = Array.isArray(f.options) ? f.options.join('\n') : '';
  return `
    <div class="sp-field-card" data-sp-field-i="${i}">
      <div class="sp-field-card-head">
        <label class="sp-label sp-field-label-inline">名称</label>
        <input type="text" data-k="name" class="sp-field-name" value="${esc(f.name || '')}" />
        <button type="button" class="sp-btn sp-field-del" title="删除">✕</button>
      </div>
      <div class="sp-field-row-split">
        <div class="sp-field-cell">
          <label class="sp-label">类型</label>
          <select data-k="type">
            <option value="text" ${type === 'text' ? 'selected' : ''}>文本</option>
            <option value="number" ${type === 'number' ? 'selected' : ''}>数字</option>
            <option value="enum" ${type === 'enum' ? 'selected' : ''}>枚举（分类）</option>
          </select>
        </div>
        <div class="sp-field-cell">
          <label class="sp-label" title="只作为发给 AI 的示例，不显示在面板上">示例值</label>
          <input data-k="value" type="${valInputType}" ${isNum ? 'step="any"' : ''} value="${esc(defVal)}" />
        </div>
      </div>
      <div class="sp-field-range" data-sp-range-row style="${rangeDisplay}">
        <span class="sp-label">允许范围（仅数字）</span>
        <div class="sp-field-range-inputs">
          <input type="number" data-k="min" step="any" value="${esc(minV)}" placeholder="最小" ${isNum ? '' : 'disabled'} />
          <span class="sp-field-range-dash" aria-hidden="true">–</span>
          <input type="number" data-k="max" step="any" value="${esc(maxV)}" placeholder="最大" ${isNum ? '' : 'disabled'} />
        </div>
      </div>
      <div class="sp-field-options" data-sp-options-row style="${optsDisplay}">
        <label class="sp-label">允许选项（每行一个 — 模型限于这些值）</label>
        <textarea data-k="options" rows="3" spellcheck="false" placeholder="happy&#10;neutral&#10;sad">${esc(optsText)}</textarea>
      </div>
      <div class="sp-field-hint-row">
        <label class="sp-label">描述 <span style="opacity:.55;font-weight:400">（指导 AI — 包含在发送给模型的 JSON 模式中）</span></label>
        <input type="text" data-k="hint" value="${esc(String(f.hint || ''))}" placeholder="例如：当前房间或建筑，请具体描述" />
      </div>
    </div>`;
}

/**
 * @param {object} [opts]
 * @param {boolean} [opts.removePanels] - If true, also remove rendered panel DOM elements (no re-render).
 */
async function spClearAllChatStatusData(opts) {
  const TH = getTH();
  if (!TH || typeof TH.getChatMessages !== 'function' || typeof TH.setChatMessages !== 'function') {
    spToast('TH.getChatMessages 不可用', '状态面板');
    return;
  }
  let chatLength = 0;
  try {
    const root = window.parent && window.parent !== window ? window.parent : window;
    const ST = (root.SillyTavern) || (typeof SillyTavern !== 'undefined' ? SillyTavern : null);
    if (ST && typeof ST.getContext === 'function') {
      const ctx = ST.getContext();
      chatLength = (ctx && ctx.chat && ctx.chat.length) || 0;
    }
  } catch { /* ignore */ }
  if (!chatLength) {
    spToast('未加载聊天', '状态面板');
    return;
  }
  const toUpdate = [];
  for (let i = 0; i < chatLength; i++) {
    const rows = TH.getChatMessages(String(i), { role: 'all', hide_state: 'all', include_swipes: false });
    const row = rows && rows[0];
    if (!row || !row.data) continue;
    const d = row.data;
    if (d[SP_CHAT_STATUS_KEY]) {
      const next = { ...d };
      delete next[SP_CHAT_STATUS_KEY];
      toUpdate.push({ message_id: i, data: next });
    }
  }
  if (!toUpdate.length) {
    spToast('当前聊天无状态数据', '状态面板');
    return;
  }
  await TH.setChatMessages(toUpdate, { refresh: 'none' });
  if (opts && opts.removePanels) {
    chatDoc().querySelectorAll('.sp-block-root').forEach((el) => el.remove());
    spToast(`已从聊天中移除 ${toUpdate.length} 个面板`, '状态面板');
  } else {
    refreshAllAssistantPanels();
    spToast(`已清除 ${toUpdate.length} 条消息的状态数据`, '状态面板');
  }
}

function spShowClearModal() {
  const doc = chatDoc();
  const existing = doc.getElementById('sp-clear-modal');
  if (existing) { existing.remove(); return; }

  const overlay = doc.createElement('div');
  overlay.id = 'sp-clear-modal';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.65);z-index:100001;display:flex;align-items:center;justify-content:center;';

  const box = doc.createElement('div');
  box.style.cssText =
    'background:#1e1e2e;border:1px solid rgba(255,255,255,.15);border-radius:14px;' +
    'padding:24px 28px;max-width:380px;width:90%;color:rgba(255,255,255,.9);' +
    'font:14px/1.5 system-ui,sans-serif;box-shadow:0 8px 32px rgba(0,0,0,.5);';
  box.innerHTML =
    '<h3 style="margin:0 0 6px;font-size:15px;font-weight:650;">清除状态面板</h3>' +
    '<p style="margin:0 0 18px;font-size:12px;opacity:.65;">选择要从当前聊天中清除的内容：</p>' +
    '<div style="display:flex;flex-direction:column;gap:10px;">' +
      '<button id="sp-cm-data-only" style="all:unset;cursor:pointer;box-sizing:border-box;padding:11px 14px;border-radius:9px;border:1px solid rgba(255,255,255,.18);background:rgba(0,0,0,.3);text-align:left;">' +
        '<div style="font-weight:600;font-size:13px;margin-bottom:3px;">仅清除数据</div>' +
        '<div style="font-size:11px;opacity:.6;">从所有消息中移除存储的状态值，面板保持可见并重新渲染为空。</div>' +
      '</button>' +
      '<button id="sp-cm-remove-panels" style="all:unset;cursor:pointer;box-sizing:border-box;padding:11px 14px;border-radius:9px;border:1px solid rgba(255,160,80,.3);background:rgba(200,120,0,.1);text-align:left;">' +
        '<div style="font-weight:600;font-size:13px;margin-bottom:3px;">从聊天中移除所有面板</div>' +
        '<div style="font-size:11px;opacity:.6;">清除存储数据并从聊天 DOM 中移除已渲染的面板元素。</div>' +
      '</button>' +
      '<button id="sp-cm-cancel" style="all:unset;cursor:pointer;box-sizing:border-box;padding:8px 14px;border-radius:9px;border:1px solid rgba(255,255,255,.1);background:transparent;text-align:center;font-size:13px;opacity:.6;">取消</button>' +
    '</div>';

  overlay.appendChild(box);
  doc.body.appendChild(overlay);

  const closeModal = () => overlay.remove();
  // Stop bubbling so modal interactions don't reach ST document-level handlers
  ['mousedown', 'pointerdown'].forEach((t) => overlay.addEventListener(t, (e) => e.stopPropagation()));
  overlay.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
  overlay.addEventListener('click', (e) => { e.stopPropagation(); if (e.target === overlay) closeModal(); });
  doc.getElementById('sp-cm-cancel').addEventListener('click', closeModal);
  doc.getElementById('sp-cm-data-only').addEventListener('click', () => {
    closeModal();
    void spClearAllChatStatusData();
  });
  doc.getElementById('sp-cm-remove-panels').addEventListener('click', () => {
    closeModal();
    void spClearAllChatStatusData({ removePanels: true });
  });
}

/**
 * Per-message values editor. Triggered by the ✏ Edit action button in the panel iframe.
 * Source field is preserved — only `values` is updated.
 */
function spShowEditModal(messageId) {
  const doc = chatDoc();
  const existing = doc.getElementById('sp-edit-modal');
  if (existing) { existing.remove(); return; }

  const cfg = effectiveConfig();
  const fields = Array.isArray(cfg.fields) ? cfg.fields : [];
  if (!fields.length) {
    spToast('未配置字段', '状态面板');
    return;
  }
  const row = spGetMessageRow(messageId);
  if (!row) {
    spToast(`消息 ${messageId} 不存在`, '状态面板');
    return;
  }
  const st = spGetMessageStatus(row);
  const curValues = st && st.values && typeof st.values === 'object' ? st.values : {};

  const overlay = doc.createElement('div');
  overlay.id = 'sp-edit-modal';
  overlay.className = 'sp-edit-modal';
  // Inherit the active card's theme (S6): --sp-* vars scoped to the modal subtree only.
  try {
    overlay.style.cssText = spBuildThemeVarBlock(spLayoutTheme(cfg)).replace(/^:root\{/, '').replace(/\}$/, '');
  } catch (e) { log('edit modal theme', e); }

  const fieldRows = fields.map((f, i) => {
    const name = String(f.name || '').trim();
    if (!name) return '';
    const id = `sp-em-f-${i}`;
    const cur = curValues[name];
    const hint = f.hint ? `<div class="sp-em-hint">${esc(String(f.hint))}</div>` : '';
    const labelHtml = `<label class="sp-em-label" for="${id}">${esc(name)}</label>`;

    if (f.type === 'number') {
      const lo = Number.isFinite(Number(f.min)) ? ` min="${Number(f.min)}"` : '';
      const hi = Number.isFinite(Number(f.max)) ? ` max="${Number(f.max)}"` : '';
      const v = cur === '' || cur == null ? '' : String(cur);
      return (
        `<div class="sp-em-row">${labelHtml}` +
        `<input type="number" class="sp-em-input" id="${id}" data-sp-em-name="${esc(name)}" data-sp-em-type="number"${lo}${hi} step="1" value="${esc(v)}"/>` +
        hint + `</div>`
      );
    }
    if (f.type === 'enum') {
      const opts = typeof spFieldEnumOptions === 'function' ? spFieldEnumOptions(f) : (Array.isArray(f.options) ? f.options : []);
      const curStr = cur == null ? '' : String(cur);
      const lc = curStr.toLowerCase();
      const matched = opts.find((o) => String(o).toLowerCase() === lc) || '';
      const optionsHtml = ['<option value=""></option>']
        .concat(opts.map((o) => {
          const s = String(o);
          const sel = s === matched ? ' selected' : '';
          return `<option value="${esc(s)}"${sel}>${esc(s)}</option>`;
        }))
        .join('');
      return (
        `<div class="sp-em-row">${labelHtml}` +
        `<select class="sp-em-input" id="${id}" data-sp-em-name="${esc(name)}" data-sp-em-type="enum">${optionsHtml}</select>` +
        hint + `</div>`
      );
    }
    const v = cur == null ? '' : String(cur);
    return (
      `<div class="sp-em-row">${labelHtml}` +
      `<textarea class="sp-em-input sp-em-textarea" id="${id}" data-sp-em-name="${esc(name)}" data-sp-em-type="text" spellcheck="false">${esc(v)}</textarea>` +
      hint + `</div>`
    );
  }).join('');

  const box = doc.createElement('div');
  box.className = 'sp-edit-box';
  box.innerHTML =
    `<h3 class="sp-em-title">编辑状态值（消息 #${esc(String(messageId))}）</h3>` +
    `<p class="sp-em-sub">字段值在保存时按规则规范化（数值夹紧到范围、枚举大小写恢复），源标记不会改变。</p>` +
    `<div class="sp-em-fields">${fieldRows}</div>` +
    `<div class="sp-em-actions">` +
      `<button type="button" class="sp-em-btn sp-em-btn-reset" id="sp-em-reset">重置</button>` +
      `<span style="flex:1"></span>` +
      `<button type="button" class="sp-em-btn sp-em-btn-cancel" id="sp-em-cancel">取消</button>` +
      `<button type="button" class="sp-em-btn sp-em-btn-save" id="sp-em-save">保存</button>` +
    `</div>`;

  overlay.appendChild(box);
  doc.body.appendChild(overlay);

  const closeModal = () => overlay.remove();
  ['mousedown', 'pointerdown'].forEach((t) => overlay.addEventListener(t, (e) => e.stopPropagation()));
  overlay.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
  overlay.addEventListener('click', (e) => { e.stopPropagation(); if (e.target === overlay) closeModal(); });

  doc.getElementById('sp-em-cancel').addEventListener('click', closeModal);

  doc.getElementById('sp-em-reset').addEventListener('click', () => {
    const inputs = box.querySelectorAll('[data-sp-em-name]');
    inputs.forEach((el) => {
      const name = el.getAttribute('data-sp-em-name');
      const t = el.getAttribute('data-sp-em-type');
      const cur = curValues[name];
      const v = cur == null ? '' : String(cur);
      if (t === 'enum') {
        const lc = v.toLowerCase();
        const opts = Array.from(el.querySelectorAll('option')).map((o) => o.value);
        const hit = opts.find((o) => o.toLowerCase() === lc) || '';
        el.value = hit;
      } else {
        el.value = v;
      }
    });
  });

  doc.getElementById('sp-em-save').addEventListener('click', async () => {
    const raw = {};
    box.querySelectorAll('[data-sp-em-name]').forEach((el) => {
      const name = el.getAttribute('data-sp-em-name');
      raw[name] = el.value;
    });
    /** Reuse the same normalizer the generation/markers paths use, so manual edits
     *  honor number ranges and enum case in one place. */
    const nextValues = spNormalizeValuesFromParsed(raw, fields);
    try {
      await spMergeChatMessageData(messageId, (prev) => {
        const cur = prev[SP_CHAT_STATUS_KEY] || {};
        // Hand-edited values are always 'manual'; a previous error state is resolved by the edit.
        const nextSt = { ...cur, values: nextValues, source: 'manual' };
        delete nextSt.error;
        return {
          ...prev,
          [SP_CHAT_STATUS_KEY]: nextSt,
          [SP_CHAT_META_KEY]: {
            ...((prev[SP_CHAT_META_KEY] && typeof prev[SP_CHAT_META_KEY] === 'object') ? prev[SP_CHAT_META_KEY] : {}),
            updatedAt: Date.now(),
          },
        };
      });
      renderPanelForMessage(messageId);
      closeModal();
      spToast('状态值已保存', '状态面板');
    } catch (e) {
      log('spShowEditModal save failed', e);
      spToast(String(e && e.message ? e.message : e), '状态面板保存失败');
    }
  });
}

// ─── 字段 tab ────────────────────────────────────────────────────────────────

function spRenderFieldsTab(cfg) {
  const rows = (cfg.fields || []).map((f, i) => spFieldCardHtml(f, i)).join('');
  return `
    <div class="sp-help">
      <p class="sp-help-p">字段名同时用作 AI 输出键名、模板 <code>{字段名}</code> 令牌和面板标签，随角色卡保存。</p>
    </div>
    <div>
      <label class="sp-label">状态字段</label>
      <div class="sp-field-list" id="sp-field-rows">${rows}</div>
      <div class="sp-actions">
        <button type="button" class="sp-btn" id="sp-add-field">添加字段</button>
        <button type="button" class="sp-btn" id="sp-sample-fields">使用示例字段</button>
      </div>
    </div>
    <div>
      <label class="sp-label">状态块（供开场白预填）</label>
      <p class="sp-help-p" style="font-size:11px;opacity:.75;">把状态块粘进开场白，进聊天时面板会读取其中的初始值。</p>
      <div class="sp-actions">
        <button type="button" class="sp-btn sp-btn-sm" id="sp-block-toggle">显示状态块</button>
        <button type="button" class="sp-btn sp-btn-sm" id="sp-block-copy">复制状态块</button>
      </div>
      <textarea id="sp-block-preview" readonly spellcheck="false" style="display:none;min-height:4.5em;"></textarea>
    </div>
    <div class="sp-actions">
      <button type="button" class="sp-btn" id="sp-save-fields">保存到角色卡</button>
    </div>
  `;
}

function spBindFieldsTab() {
  const doc = chatDoc();

  const wireCard = (card) => {
    const sel = card.querySelector('[data-k="type"]');
    if (sel) {
      sel.addEventListener('change', () => spSyncFieldCardInputs(card));
      spSyncFieldCardInputs(card);
    }
    const del = card.querySelector('.sp-field-del');
    if (del) del.addEventListener('click', () => card.remove());
  };
  doc.querySelectorAll('#sp-field-rows .sp-field-card[data-sp-field-i]').forEach(wireCard);

  const appendCard = (f) => {
    const list = doc.getElementById('sp-field-rows');
    if (!list) return;
    const i = list.querySelectorAll('.sp-field-card').length;
    const wrap = doc.createElement('div');
    wrap.innerHTML = spFieldCardHtml(f, i).trim();
    const card = wrap.firstElementChild;
    if (!card) return;
    list.appendChild(card);
    wireCard(card);
  };

  const add = doc.getElementById('sp-add-field');
  if (add) {
    add.addEventListener('click', () => appendCard({ name: '', type: 'text', value: '' }));
  }

  const sample = doc.getElementById('sp-sample-fields');
  if (sample) {
    sample.addEventListener('click', () => {
      const existingNames = new Set(
        Array.from(doc.querySelectorAll('#sp-field-rows [data-k="name"]'))
          .map((el) => String(el.value || '').trim())
          .filter(Boolean),
      );
      let added = 0;
      (SP_SAMPLE_FIELDS || []).forEach((f) => {
        if (existingNames.has(String(f.name))) return;
        appendCard({ ...f });
        added++;
      });
      spToast(added ? `已添加 ${added} 个示例字段 — 记得点击「保存到角色卡」` : '示例字段已全部存在', '状态面板');
    });
  }

  // Status block for greeting prefill: current editor rows (incl. unsaved edits),
  // one key per field, value = the field's 示例值. Uses the configured tag so ports
  // with a custom tagStart/tagEnd copy the right markers.
  const buildStatusBlock = () => {
    const fields = spCollectFieldsFromTable();
    const tag = spTagPair(effectiveConfig());
    const obj = {};
    fields.forEach((f) => {
      if (f.type === 'number') {
        obj[f.name] = Number.isFinite(f.value)
          ? f.value
          : Number.isFinite(Number(f.min))
            ? Number(f.min)
            : 0;
      } else {
        obj[f.name] = String(f.value || '');
      }
    });
    return tag.start + JSON.stringify(obj) + tag.end;
  };

  const blockToggle = doc.getElementById('sp-block-toggle');
  const blockCopy = doc.getElementById('sp-block-copy');
  const blockTa = doc.getElementById('sp-block-preview');
  if (blockToggle && blockTa) {
    blockToggle.addEventListener('click', () => {
      if (blockTa.style.display === 'none') {
        blockTa.value = buildStatusBlock();
        blockTa.style.display = '';
        blockToggle.textContent = '隐藏状态块';
      } else {
        blockTa.style.display = 'none';
        blockToggle.textContent = '显示状态块';
      }
    });
  }
  if (blockCopy && blockTa) {
    blockCopy.addEventListener('click', async () => {
      const block = buildStatusBlock();
      if (blockTa.style.display !== 'none') blockTa.value = block;
      const ok = await spCopyText(block);
      if (ok) {
        spToast('状态块已复制 — 粘贴到开场白即可预填初始值', '状态面板');
      } else {
        // Clipboard blocked: surface the textarea so the author can copy by hand.
        blockTa.value = block;
        blockTa.style.display = '';
        if (blockToggle) blockToggle.textContent = '隐藏状态块';
        spToast('复制失败 — 已在下方显示，请手动复制', '状态面板');
      }
    });
  }

  const save = doc.getElementById('sp-save-fields');
  if (save) {
    save.addEventListener('click', async () => {
      const fields = spCollectFieldsFromTable();
      try {
        await spCharDefSave({ fields });
        spToast('字段已保存到角色卡', '状态面板');
        renderPanelContent();
        refreshAllAssistantPanels();
      } catch (e) {
        log('fields tab save failed', e);
        spToast(String(e && e.message ? e.message : e), '状态面板保存失败');
      }
    });
  }
}

function spSyncFieldCardInputs(card) {
  if (!card) return;
  const type = card.querySelector('[data-k="type"]');
  const minEl = card.querySelector('[data-k="min"]');
  const maxEl = card.querySelector('[data-k="max"]');
  const valEl = card.querySelector('[data-k="value"]');
  const rangeRow = card.querySelector('[data-sp-range-row]');
  const optsRow = card.querySelector('[data-sp-options-row]');
  if (!type || !valEl) return;
  const t = type.value;
  const isNum = t === 'number';
  const isEnum = t === 'enum';
  if (minEl) minEl.disabled = !isNum;
  if (maxEl) maxEl.disabled = !isNum;
  if (rangeRow) rangeRow.style.display = isNum ? '' : 'none';
  if (optsRow) optsRow.style.display = isEnum ? '' : 'none';
  valEl.type = isNum ? 'number' : 'text';
  if (isNum) valEl.setAttribute('step', 'any');
  else valEl.removeAttribute('step');
}

function spCollectFieldsFromTable() {
  const doc = chatDoc();
  const cards = doc.querySelectorAll('#sp-field-rows .sp-field-card[data-sp-field-i]');
  const fields = [];
  cards.forEach((card) => {
    const name = card.querySelector('[data-k="name"]');
    const type = card.querySelector('[data-k="type"]');
    const val = card.querySelector('[data-k="value"]');
    const minEl = card.querySelector('[data-k="min"]');
    const maxEl = card.querySelector('[data-k="max"]');
    const optsEl = card.querySelector('[data-k="options"]');
    const hintEl = card.querySelector('[data-k="hint"]');
    if (!name || !type) return;
    const n = String(name.value || '').trim();
    if (!n) return;
    const t = type.value === 'number' ? 'number' : type.value === 'enum' ? 'enum' : 'text';
    const o = {
      name: n,
      type: t,
      value: val && val.value !== '' ? (t === 'number' ? Number(val.value) : val.value) : '',
      hint: hintEl ? String(hintEl.value || '').trim() : '',
    };
    if (t === 'number') {
      if (minEl && minEl.value !== '' && Number.isFinite(Number(minEl.value))) o.min = Number(minEl.value);
      if (maxEl && maxEl.value !== '' && Number.isFinite(Number(maxEl.value))) o.max = Number(maxEl.value);
    } else if (t === 'enum') {
      const raw = optsEl ? String(optsEl.value || '') : '';
      const opts = raw
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      o.options = Array.from(new Set(opts));
    }
    fields.push(o);
  });
  return fields;
}

// ─── 样式 tab ────────────────────────────────────────────────────────────────

function spExtractClassNamesFromHtml(html) {
  if (!html || typeof html !== 'string') return [];
  const out = new Set();
  const re = /class\s*=\s*("([^"]*)"|'([^']*)')/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const list = (m[2] || m[3] || '').split(/\s+/).filter(Boolean);
    for (const c of list) out.add('.' + c);
  }
  return Array.from(out);
}

/**
 * Scan a template for `{...}` / `{{...}}` tokens that will NOT be replaced at render
 * time (not a field name, not a reserved token). Heuristic filters keep CSS/JS brace
 * content ({display:flex}, ${x}, function bodies) out of the warning list.
 */
function spTemplateTokenWarnings(tpl, fields) {
  const known = new Set((fields || []).map((f) => String(f.name || '').trim()).filter(Boolean));
  const reserved = new Set(['sp_actions', 'sp_badge']);
  const bad = [];
  const seen = new Set();
  const consider = (name, tok) => {
    const n = String(name);
    if (known.has(n) || reserved.has(n) || seen.has(tok)) return;
    if (/[:;{}"'`=<>()\[\]\\\/]/.test(n)) return; // CSS rule bodies, JS expressions
    if (n.trim() !== n || !n.length || n.length > 30) return;
    seen.add(tok);
    bad.push(tok);
  };
  // {{name}} default tokens were removed in v3 (S10) — any that remain render literally,
  // so flag every one. Stripping them first also keeps the single-brace pass clean.
  const rest = String(tpl || '').replace(/\{\{([^{}\n]+)\}\}/g, (m, n) => {
    const inner = String(n).trim();
    if (inner.length && inner.length <= 30 && !seen.has(m)) {
      seen.add(m);
      bad.push(m);
    }
    return '';
  });
  rest.replace(/\{([^{}\n]+)\}/g, (m, n) => {
    consider(n, m);
    return '';
  });
  return bad;
}

/** <input type="color"> only accepts #rrggbb — expand shorthand, drop alpha. */
function spHex7(v, fallback) {
  const s = String(v || '').trim();
  if (!/^#[0-9a-fA-F]{3,8}$/.test(s)) return fallback;
  if (s.length === 4) return '#' + s.slice(1).split('').map((c) => c + c).join('');
  return s.slice(0, 7);
}

/**
 * A theme colour knob that follows the accent (or a neutral default) until the author
 * edits it. Stored value '' = follow; a hex = custom override. The ↺ link clears the
 * override so the colour tracks the base again — closes the earlier un-override UX gap.
 * @param {boolean} followsAccent true = swatch tracks 主色 live while un-overridden.
 */
function spThemeColorField(label, id, value, fallback, followsAccent) {
  const overridden = !!value;
  const shown = spHex7(value, fallback);
  return (
    `<label>${esc(label)} ` +
    `<input type="color" id="${id}" value="${esc(shown)}"` +
      ` data-sp-overridden="${overridden ? '1' : ''}" data-sp-follows-accent="${followsAccent ? '1' : ''}" data-sp-fallback="${esc(fallback)}"/>` +
    `<button type="button" data-sp-reset="${id}" title="恢复跟随（主色/默认）"` +
      ` style="all:unset;cursor:pointer;margin-left:2px;font-size:12px;opacity:${overridden ? '.75' : '.3'};">↺</button>` +
    `</label>`
  );
}

function spRenderStylesTab(cfg) {
  const liveOpts = spLiveTokenDatalistHtml(cfg.fields || []);
  const t = spLayoutTheme(cfg);
  const accent7 = spHex7(t.accent, SP_THEME_DEFAULTS.accent);
  const isAdvanced = cfg.designMode === 'advanced';

  return `
    <div>
      <label class="sp-label">挂载 — 哪些消息显示状态面板</label>
      <div class="sp-row">
        <label><input type="radio" name="sp-render-mode" value="last_only" ${cfg.renderMode !== 'every_message' ? 'checked' : ''}/> 仅最新消息</label>
        <label><input type="radio" name="sp-render-mode" value="every_message" ${cfg.renderMode === 'every_message' ? 'checked' : ''}/> 每条助手消息</label>
      </div>
    </div>
    <div>
      <label class="sp-label">设计模式</label>
      <div class="sp-row">
        <label><input type="radio" name="sp-design-mode" value="simple" ${!isAdvanced ? 'checked' : ''}/> 简易（按字段自动生成排版）</label>
        <label><input type="radio" name="sp-design-mode" value="advanced" ${isAdvanced ? 'checked' : ''}/> 高级（粘贴完整 HTML+CSS）</label>
      </div>
    </div>
    <div id="sp-design-simple" style="${isAdvanced ? 'display:none' : ''}">
      <label class="sp-label">主题</label>
      <div class="sp-row sp-theme-row">
        <label>主色 <input type="color" id="sp-theme-accent" value="${esc(accent7)}"/></label>
        <label>圆角 <input type="number" id="sp-theme-radius" min="0" max="32" step="1" value="${esc(String(t.radius))}" style="width:4rem"/></label>
        <label>字号 <input type="number" id="sp-theme-size" min="10" max="20" step="1" value="${esc(String(t.textSize))}" style="width:4rem"/></label>
      </div>
      <div class="sp-row sp-theme-row">
        ${spThemeColorField('标题色', 'sp-theme-headc', t.headerColor, accent7, true)}
        ${spThemeColorField('状态栏边框色', 'sp-theme-borderc', t.borderColor, accent7, true)}
        ${spThemeColorField('主文字颜色', 'sp-theme-textc', t.textColor, '#eaeef7', false)}
      </div>
      <div class="sp-row sp-theme-row">
        ${spThemeColorField('按钮颜色', 'sp-theme-btnc', t.btnColor, accent7, true)}
        ${spThemeColorField('按钮边框色', 'sp-theme-btnbc', t.btnBorderColor, accent7, true)}
        ${spThemeColorField('按钮文字颜色', 'sp-theme-btntc', t.btnTextColor, '#eaeef7', false)}
      </div>
      <div class="sp-row sp-theme-row">
        <label><input type="checkbox" id="sp-theme-fold" ${t.buttonsCollapsed ? 'checked' : ''}/> 按钮折叠（⋯ 展开操作栏）</label>
      </div>
      <div class="sp-row sp-theme-row">
        <label>字体链接 <input type="text" id="sp-theme-font" list="sp-dl-theme-fonts" value="${esc(String((cfg.theme && cfg.theme.font) || ''))}" placeholder="Google Fonts 链接（留空 = 系统字体）" style="width:22rem"/></label>
        <datalist id="sp-dl-theme-fonts">
          <option value="https://fonts.googleapis.com/css2?family=Noto+Serif+SC&display=swap">思源宋体（Noto Serif SC）</option>
          <option value="https://fonts.googleapis.com/css2?family=Noto+Sans+SC&display=swap">思源黑体（Noto Sans SC）</option>
          <option value="https://fonts.googleapis.com/css2?family=LXGW+WenKai+TC&display=swap">霞鹜文楷 TC</option>
          <option value="https://fonts.googleapis.com/css2?family=Ma+Shan+Zheng&display=swap">马善政毛笔楷书</option>
          <option value="https://fonts.googleapis.com/css2?family=ZCOOL+XiaoWei&display=swap">站酷小薇</option>
        </datalist>
      </div>
      <div class="sp-actions">
        <button type="button" class="sp-btn" id="sp-gen-layout">重新生成排版</button>
      </div>
      <p class="sp-help-p" style="font-size:11px;opacity:.75;">改动任意主题项即时更新下方预览，保存时重新生成排版并写入角色卡（颜色可点「跟随主色」恢复默认）。</p>
    </div>
    <div id="sp-design-advanced" style="${isAdvanced ? '' : 'display:none'}">
      <div class="sp-help">
        <strong>样式说明</strong>
        <p class="sp-help-p">在此粘贴完整的 <code>.html</code> 文件，CSS 自动限定到 iframe、脚本可运行。</p>
        <p class="sp-help-p"><code>{name}</code> = 实时值；保留标记 <code>{sp_actions}</code>（重试/编辑栏）、<code>{sp_badge}</code>（状态徽章）。</p>
      </div>
      <label class="sp-label">模板（.html — 粘贴包含 &lt;style&gt; 和 HTML 的完整文件）</label>
      <div class="sp-import-row">
        <button type="button" class="sp-btn sp-btn-sm" id="sp-import-html-btn">导入 .html 文件…</button>
      </div>
      <textarea id="sp-html-template" spellcheck="false">${esc(cfg.htmlTemplate || '')}</textarea>
      <div class="sp-row sp-insert-row">
        <input type="text" list="sp-dl-live-tokens" id="sp-insert-live" class="sp-insert-field-brace" placeholder="插入 {name}（实时值）…" />
        <datalist id="sp-dl-live-tokens">${liveOpts}</datalist>
      </div>
    </div>
    <div id="sp-token-warnings" class="sp-token-warnings" style="display:none"></div>
    <div>
      <label class="sp-label">实时预览 — 沙箱 iframe，脚本可运行，渲染路径与聊天相同</label>
      <div class="sp-preview-wrap"><div class="sp-block-shell" id="sp-style-preview"></div></div>
    </div>
    <div class="sp-actions">
      <button type="button" class="sp-btn" id="sp-save-styles">保存到角色卡</button>
    </div>
  `;
}

function spPickFile(doc, accept, onText) {
  const input = doc.createElement('input');
  input.type = 'file';
  input.accept = accept;
  input.style.display = 'none';
  doc.body.appendChild(input);
  const cleanup = () => { if (input.parentNode) input.parentNode.removeChild(input); };
  input.addEventListener('change', () => {
    const file = input.files && input.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => { onText(String(e.target.result || '')); };
      reader.readAsText(file, 'utf-8');
    }
    cleanup();
  });
  input.addEventListener('cancel', cleanup);
  input.click();
}

function spBindStylesTab(cfg) {
  const doc = chatDoc();
  const tpl = doc.getElementById('sp-html-template');

  // Overridable colour knobs (S7). Un-overridden ones store '' so spBuildThemeVarBlock
  // derives them from 主色 (or a neutral default for text colours).
  const SP_COLOR_KNOBS = ['sp-theme-headc', 'sp-theme-borderc', 'sp-theme-textc', 'sp-theme-btnc', 'sp-theme-btnbc', 'sp-theme-btntc'];
  const COLOR_KEY = {
    'sp-theme-headc': 'headerColor',
    'sp-theme-borderc': 'borderColor',
    'sp-theme-textc': 'textColor',
    'sp-theme-btnc': 'btnColor',
    'sp-theme-btnbc': 'btnBorderColor',
    'sp-theme-btntc': 'btnTextColor',
  };

  /** Theme knobs as currently shown in the 简易 section — shared by preview, regen and 保存.
   *  Overridable colours store '' (= follow accent/default) until the author edits them.
   *  Falls back to the saved cfg.theme when the 简易 knobs aren't in the DOM (高级 mode). */
  const collectTheme = () => {
    const accentEl = doc.getElementById('sp-theme-accent');
    if (!accentEl) return (cfg.theme && typeof cfg.theme === 'object') ? cfg.theme : {};
    const val = (id) => {
      const el = doc.getElementById(id);
      return el ? el.value : '';
    };
    const overrideColor = (id) => {
      const el = doc.getElementById(id);
      return el && el.dataset.spOverridden === '1' ? el.value : '';
    };
    const foldEl = doc.getElementById('sp-theme-fold');
    const theme = {
      accent: val('sp-theme-accent') || SP_THEME_DEFAULTS.accent,
      radius: val('sp-theme-radius') !== '' ? Number(val('sp-theme-radius')) : SP_THEME_DEFAULTS.radius,
      textSize: val('sp-theme-size') !== '' ? Number(val('sp-theme-size')) : SP_THEME_DEFAULTS.textSize,
      font: String(val('sp-theme-font') || '').trim(),
      buttonsCollapsed: !!(foldEl && foldEl.checked),
    };
    SP_COLOR_KNOBS.forEach((id) => { theme[COLOR_KEY[id]] = overrideColor(id); });
    return theme;
  };

  const updateTokenWarnings = () => {
    const warnBox = doc.getElementById('sp-token-warnings');
    if (!warnBox || !tpl) return;
    const bad = spTemplateTokenWarnings(tpl.value, cfg.fields || []);
    if (bad.length) {
      warnBox.style.display = '';
      warnBox.textContent = '未识别的令牌（不会被替换）：' + bad.join('、');
    } else {
      warnBox.style.display = 'none';
      warnBox.textContent = '';
    }
  };

  const prev = () => {
    const box = doc.getElementById('sp-style-preview');
    if (!box || !tpl) return;
    const fakeVals = {};
    (cfg.fields || []).forEach((f) => {
      if (f.type === 'number') {
        const lo = Number(f.min);
        const hi = Number(f.max);
        if (Number.isFinite(lo) && Number.isFinite(hi)) fakeVals[f.name] = Math.round((lo + hi) / 2);
        else if (Number.isFinite(Number(f.value))) fakeVals[f.name] = Number(f.value);
        else fakeVals[f.name] = 0;
      } else if (f.type === 'enum') {
        const opts = typeof spFieldEnumOptions === 'function' ? spFieldEnumOptions(f) : [];
        fakeVals[f.name] = opts.length ? opts[0] : '[' + f.name + ']';
      } else {
        fakeVals[f.name] = '[' + f.name + ']';
      }
    });
    // Live theme so colour/font/radius knob changes reflect immediately (S7): the
    // template's bar-calc CSS comes from tpl.value, the chrome colours from theme vars.
    const cfgPrev = {
      ...cfg,
      theme: collectTheme(),
      htmlTemplate: tpl.value,
      css: '',
    };
    let srcdoc;
    try {
      srcdoc = spBuildIframeSrcdoc(cfgPrev, fakeVals, { source: 'auto' });
    } catch (e) {
      console.error('[status-panel] style preview build failed', e);
      srcdoc =
        '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><div class="sp-iframe-root"><p>预览失败</p></div></body></html>';
    }
    spMountIframe(box, srcdoc);
    updateTokenWarnings();
  };
  prev();
  if (tpl) tpl.addEventListener('input', prev);

  const syncDesignVisibility = () => {
    const mode = doc.querySelector('input[name="sp-design-mode"]:checked');
    const isSimple = !mode || mode.value !== 'advanced';
    const simpleBox = doc.getElementById('sp-design-simple');
    const advBox = doc.getElementById('sp-design-advanced');
    if (simpleBox) simpleBox.style.display = isSimple ? '' : 'none';
    if (advBox) advBox.style.display = isSimple ? 'none' : '';
  };
  doc.querySelectorAll('input[name="sp-design-mode"]').forEach((r) => {
    r.addEventListener('change', syncDesignVisibility);
  });

  /** 简易 mode is live: any knob change regenerates the template into the textarea
   *  (same pipeline as 高级 — preview and save read the identical content). */
  const regenSimple = () => {
    const modeEl = doc.querySelector('input[name="sp-design-mode"]:checked');
    if (modeEl && modeEl.value === 'advanced') return false;
    const cur = effectiveConfig();
    const fields = Array.isArray(cur.fields) ? cur.fields : [];
    if (!fields.length) return false;
    const html = spGenerateLayoutHtml(fields, collectTheme());
    if (tpl) {
      tpl.value = html;
      tpl.dispatchEvent(new Event('input'));
    }
    return true;
  };

  // Editing a colour marks it as an override; the ↺ reset link clears the override so
  // it follows the accent/default again.
  const markOverride = (el, on) => {
    el.dataset.spOverridden = on ? '1' : '';
    const reset = doc.querySelector(`[data-sp-reset="${el.id}"]`);
    if (reset) reset.style.opacity = on ? '.75' : '.3';
  };
  SP_COLOR_KNOBS.forEach((id) => {
    const el = doc.getElementById(id);
    if (el) el.addEventListener('input', () => markOverride(el, true));
  });
  doc.querySelectorAll('[data-sp-reset]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const el = doc.getElementById(btn.getAttribute('data-sp-reset'));
      if (!el) return;
      markOverride(el, false);
      const accentEl = doc.getElementById('sp-theme-accent');
      const accent7 = accentEl ? spHex7(accentEl.value, SP_THEME_DEFAULTS.accent) : SP_THEME_DEFAULTS.accent;
      el.value = el.dataset.spFollowsAccent === '1' ? accent7 : spHex7(el.dataset.spFallback, accent7);
      regenSimple();
    });
  });
  // 主色 change updates the swatch of every accent-following, un-overridden colour.
  const accentInput = doc.getElementById('sp-theme-accent');
  if (accentInput) {
    accentInput.addEventListener('input', () => {
      const a7 = spHex7(accentInput.value, SP_THEME_DEFAULTS.accent);
      SP_COLOR_KNOBS.forEach((id) => {
        const el = doc.getElementById(id);
        if (el && el.dataset.spOverridden !== '1' && el.dataset.spFollowsAccent === '1') el.value = a7;
      });
    });
  }
  ['sp-theme-accent', 'sp-theme-radius', 'sp-theme-size', 'sp-theme-font', 'sp-theme-fold'].concat(SP_COLOR_KNOBS).forEach((id) => {
    const el = doc.getElementById(id);
    if (el) {
      el.addEventListener('input', regenSimple);
      el.addEventListener('change', regenSimple);
    }
  });

  const genBtn = doc.getElementById('sp-gen-layout');
  if (genBtn) {
    genBtn.addEventListener('click', () => {
      // Explicit regen — useful after editing fields on the 字段 tab.
      if (!regenSimple()) {
        spToast('请先在「字段」页添加并保存字段', '状态面板');
        return;
      }
      spToast('已生成排版 — 预览在下方，点击「保存到角色卡」生效', '状态面板');
    });
  }

  const importHtmlBtn = doc.getElementById('sp-import-html-btn');
  if (importHtmlBtn) {
    importHtmlBtn.addEventListener('click', () => {
      spPickFile(doc, '.html,.htm', (text) => {
        if (tpl) { tpl.value = text; tpl.dispatchEvent(new Event('input')); }
      });
    });
  }

  const insertAt = (input) => {
    if (!input || !tpl) return;
    input.addEventListener('change', () => {
      const v = (input.value || '').trim();
      if (!v) return;
      const start = tpl.selectionStart ?? tpl.value.length;
      const end = tpl.selectionEnd ?? tpl.value.length;
      tpl.value = tpl.value.slice(0, start) + v + tpl.value.slice(end);
      tpl.dispatchEvent(new Event('input'));
      input.value = '';
      tpl.focus();
    });
  };
  insertAt(doc.getElementById('sp-insert-live'));

  const save = doc.getElementById('sp-save-styles');
  if (save) {
    save.addEventListener('click', async () => {
      const modeEl = doc.querySelector('input[name="sp-design-mode"]:checked');
      const renderModeEl = doc.querySelector('input[name="sp-render-mode"]:checked');
      const isAdvancedSave = !!(modeEl && modeEl.value === 'advanced');
      try {
        let htmlTemplate = tpl ? tpl.value : '';
        if (!isAdvancedSave) {
          // 简易 saves are theme-driven: regenerate from the freshest fields + knobs so
          // the persisted template can never lag behind what the knobs show.
          const cur = effectiveConfig();
          const fields = Array.isArray(cur.fields) ? cur.fields : [];
          if (fields.length) htmlTemplate = spGenerateLayoutHtml(fields, collectTheme());
        }
        await spCharDefSave({
          htmlTemplate,
          css: '',
          designMode: isAdvancedSave ? 'advanced' : 'simple',
          theme: collectTheme(),
        });
        spEngineSave({ renderMode: renderModeEl ? renderModeEl.value : 'last_only' });
        spToast('样式已保存到角色卡', '状态面板');
        injectAuthorCss();
        refreshAllAssistantPanels();
      } catch (e) {
        log('styles tab save failed', e);
        spToast(String(e && e.message ? e.message : e), '状态面板保存失败');
      }
    });
  }
}

// ─── 生成 tab ────────────────────────────────────────────────────────────────

/** Clipboard write with execCommand fallback (panel runs in the TH iframe; use parent). */
async function spCopyText(text) {
  try {
    const root = window.parent && window.parent !== window ? window.parent : window;
    if (root.navigator && root.navigator.clipboard) {
      await root.navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* fall through to execCommand */ }
  try {
    const doc = chatDoc();
    const ta = doc.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;left:-9999px;top:0;';
    doc.body.appendChild(ta);
    ta.select();
    const ok = doc.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

function spRenderGenerateTab(cfg) {
  const apiMode = cfg.apiMode === 'main' ? 'main' : 'custom';
  const role = cfg.defaultPromptRole === 'user' ? 'user'
    : cfg.defaultPromptRole === 'assistant' ? 'assistant' : 'system';

  return `
    <div class="sp-help">
      <strong>状态如何被填入</strong>
      <p class="sp-help-p">面板开启后指令随每次回复自动发送，或点面板上的「🔄 重试」手动生成一次。</p>
    </div>
    <div>
      <label class="sp-label">注入位置</label>
      <div class="sp-row">
        <label>深度 <input type="number" id="sp-inject-depth" min="0" max="999" step="1" value="${esc(String(Number(cfg.defaultPromptInChatDepth) || 0))}" style="width:5rem"/></label>
        <label>角色
          <select id="sp-inject-role">
            <option value="system" ${role === 'system' ? 'selected' : ''}>system</option>
            <option value="user" ${role === 'user' ? 'selected' : ''}>user</option>
            <option value="assistant" ${role === 'assistant' ? 'selected' : ''}>assistant</option>
          </select>
        </label>
      </div>
      <p class="sp-help-p" style="font-size:11px;opacity:.72;margin:4px 0 0 0;">深度 0 = 贴在提示词最底部，离生成最近、影响最大。</p>
    </div>
    <div>
      <label class="sp-label">实际发送内容（只读）</label>
      <textarea id="sp-inject-preview" readonly spellcheck="false" style="min-height:8em;font:11px/1.5 ui-monospace,monospace;opacity:.9;"></textarea>
      <div class="sp-actions">
        <button type="button" class="sp-btn sp-btn-sm" id="sp-copy-instr">复制</button>
      </div>
      <p class="sp-help-p" style="font-size:11px;opacity:.72;">可复制上面的内容放进预设或世界书，但别与自动注入重复。</p>
    </div>
    <div>
      <label class="sp-label">提示词指令（保存到角色卡）</label>
      <p class="sp-help-p" style="font-size:11px;opacity:.72;margin:0 0 6px 0;">你<strong>只需写这段开头指令</strong>，字段规则与状态块模板由引擎自动附加。</p>
      <textarea id="sp-def-prompt" spellcheck="false">${esc(cfg.defaultPromptContent || '')}</textarea>
    </div>
    <div>
      <label class="sp-label">状态块标记</label>
      <p class="sp-help-p" style="font-size:11px;opacity:.75;margin:0 0 6px 0;">引擎读取这对标记之间的状态，留空则使用默认的隐形标记。</p>
      <div class="sp-row sp-tag-row">
        <input type="text" id="sp-tag-start" value="${esc(cfg.tagStart || '')}" placeholder="${esc(MARKER_START)}" autocomplete="off" spellcheck="false" />
        <input type="text" id="sp-tag-end" value="${esc(cfg.tagEnd || '')}" placeholder="${esc(MARKER_END)}" autocomplete="off" spellcheck="false" />
      </div>
    </div>
    <div>
      <label class="sp-label">重试上下文</label>
      <div class="sp-row">
        <label><input type="radio" name="sp-retry-prev" value="1" ${cfg.retryIncludePrev !== false ? 'checked' : ''}/> 包含上一条已知状态（数值更连贯）</label>
        <label><input type="radio" name="sp-retry-prev" value="0" ${cfg.retryIncludePrev === false ? 'checked' : ''}/> 仅指令 + 状态块 + 最新消息</label>
      </div>
    </div>
    <div>
      <label class="sp-label">重试生成 API</label>
      <p class="sp-help-p" style="font-size:11px;opacity:.78;margin:0 0 8px 0;"><strong>主 API</strong> 用 SillyTavern 当前连接，自定义端点的密钥只存本机、绝不写入角色卡。</p>
      <div class="sp-row">
        <label><input type="radio" name="sp-api-mode" value="main" ${apiMode === 'main' ? 'checked' : ''}/> SillyTavern 主 API</label>
        <label><input type="radio" name="sp-api-mode" value="custom" ${apiMode === 'custom' ? 'checked' : ''}/> 自定义 OpenAI 兼容</label>
      </div>
      <div id="sp-api-custom-fields" style="${apiMode === 'main' ? 'display:none' : ''}">
        <div>
          <label class="sp-label">OpenAI 兼容基础 URL</label>
          <input type="text" id="sp-api-url" value="${esc(cfg.apiOpenaiUrl || '')}" placeholder="https://..." autocomplete="off" />
        </div>
        <div>
          <label class="sp-label">API 密钥（仅存储于本机）</label>
          <input type="password" id="sp-api-key" value="${esc(cfg.apiOpenaiKey || '')}" autocomplete="off" />
        </div>
        <div>
          <label class="sp-label">模型</label>
          <select id="sp-api-model-select">${spApiModelSelectInnerHtml(cfg, null)}</select>
          <p class="sp-help-p" style="font-size:11px;opacity:.78;margin:6px 0 0 0;">点「测试连接」从端点拉取模型列表。</p>
          <label class="sp-label">自定义模型 ID（可选覆盖）</label>
          <input type="text" id="sp-api-model-custom" value="" placeholder="非空则覆盖下拉选项" autocomplete="off" />
        </div>
      </div>
      <div class="sp-actions">
        <button type="button" class="sp-btn" id="sp-api-connect">测试连接</button>
      </div>
      <div id="sp-api-models" class="sp-api-models-out"></div>
    </div>
    <div class="sp-actions">
      <button type="button" class="sp-btn" id="sp-save-generate">保存</button>
    </div>
  `;
}

/** Compose the effective config with the 生成 tab's live (unsaved) instruction + tag
 *  inputs so the preview shows exactly what will be injected. */
function spGenerateDraftConfig(doc) {
  const base = effectiveConfig();
  const defTa = doc.getElementById('sp-def-prompt');
  const tagStartEl = doc.getElementById('sp-tag-start');
  const tagEndEl = doc.getElementById('sp-tag-end');
  return deepMerge(base, {
    defaultPromptContent: defTa ? defTa.value : base.defaultPromptContent,
    tagStart: tagStartEl ? tagStartEl.value.trim() : base.tagStart,
    tagEnd: tagEndEl ? tagEndEl.value.trim() : base.tagEnd,
  });
}

/** Refresh the read-only injection preview box (S2): the exact Path-A instruction text. */
function spUpdateInjectPreview() {
  const doc = chatDoc();
  const el = doc.getElementById('sp-inject-preview');
  if (!el) return;
  try {
    const cfg = spGenerateDraftConfig(doc);
    el.value = (cfg.fields || []).length
      ? spBuildFullPromptContent(cfg)
      : '（尚无字段 — 请先在「字段」页定义要追踪的状态）';
  } catch (e) {
    el.value = '预览错误：' + String(e && e.message ? e.message : e);
    log('inject preview', e);
  }
}

function spBindGenerateTab() {
  const doc = chatDoc();

  // ── API mode + connection test ──
  const customBox = doc.getElementById('sp-api-custom-fields');
  const syncCustomVisibility = () => {
    const mode = doc.querySelector('input[name="sp-api-mode"]:checked');
    const isMain = !mode || mode.value === 'main';
    if (customBox) customBox.style.display = isMain ? 'none' : '';
    const btn = doc.getElementById('sp-api-connect');
    if (btn) btn.textContent = isMain ? '测试连接（主 API）' : '测试连接（获取模型列表）';
  };
  doc.querySelectorAll('input[name="sp-api-mode"]').forEach((r) => {
    r.addEventListener('change', syncCustomVisibility);
  });
  syncCustomVisibility();

  const connect = doc.getElementById('sp-api-connect');
  if (connect) {
    connect.addEventListener('click', async () => {
      const TH = getTH();
      const out = doc.getElementById('sp-api-models');
      const mode = doc.querySelector('input[name="sp-api-mode"]:checked');
      const isMain = !mode || mode.value === 'main';
      if (!TH || typeof TH.getModelList !== 'function') {
        spToast('getModelList 不可用', '状态面板');
        return;
      }
      try {
        const list = await TH.getModelList(
          isMain
            ? { apiurl: '', key: '' }
            : {
                apiurl: doc.getElementById('sp-api-url') ? doc.getElementById('sp-api-url').value : '',
                key: doc.getElementById('sp-api-key') ? doc.getElementById('sp-api-key').value : '',
              },
        );
        if (out) out.textContent = Array.isArray(list) ? list.join(', ') : String(list);
        const sel = doc.getElementById('sp-api-model-select');
        if (sel && !isMain) {
          const preferred =
            (sel.value && String(sel.value).trim()) ||
            String(effectiveConfig().apiOpenaiModel || '').trim();
          sel.innerHTML = spApiModelSelectInnerHtml({ ...effectiveConfig(), apiOpenaiModel: preferred }, list);
        }
        spToast('连接成功', '状态面板');
      } catch (e) {
        if (out) out.textContent = String(e && e.message ? e.message : e);
        spToast(String(e && e.message ? e.message : e), '状态面板');
      }
    });
  }

  // ── 复制注入内容 ──
  const copyBtn = doc.getElementById('sp-copy-instr');
  if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
      const cfg = spGenerateDraftConfig(doc);
      if (!(cfg.fields || []).length) {
        spToast('尚无字段 — 请先在「字段」页添加并保存', '状态面板');
        return;
      }
      const text = spBuildFullPromptContent(cfg);
      const ok = await spCopyText(text);
      spToast(ok ? '已复制注入内容到剪贴板' : '复制失败 — 请检查浏览器剪贴板权限', '状态面板');
    });
  }

  // ── Live injection preview (S2): reflects unsaved instruction/tag/example edits ──
  const bindPreview = () => { spUpdateInjectPreview(); };
  const ta = doc.getElementById('sp-def-prompt');
  if (ta) ta.addEventListener('input', bindPreview);
  ['sp-tag-start', 'sp-tag-end'].forEach((id) => {
    const el = doc.getElementById(id);
    if (el) el.addEventListener('input', bindPreview);
  });
  bindPreview();

  // ── Save: engine keys (role/depth/API) via spEngineSave; card keys via spCharDefSave ──
  const save = doc.getElementById('sp-save-generate');
  if (save) {
    save.addEventListener('click', async () => {
      const injDepth = doc.getElementById('sp-inject-depth');
      const roleEl = doc.getElementById('sp-inject-role');
      const apiModeEl = doc.querySelector('input[name="sp-api-mode"]:checked');
      const customEl = doc.getElementById('sp-api-model-custom');
      const selEl = doc.getElementById('sp-api-model-select');
      const custom = customEl && String(customEl.value || '').trim();
      const model = custom || (selEl && selEl.value) || '';
      const defTa = doc.getElementById('sp-def-prompt');
      const tagStartEl = doc.getElementById('sp-tag-start');
      const tagEndEl = doc.getElementById('sp-tag-end');
      const retryPrevEl = doc.querySelector('input[name="sp-retry-prev"]:checked');
      try {
        // Injection role/depth + API credentials are per-user engine config.
        spEngineSave({
          defaultPromptRole: roleEl && (roleEl.value === 'user' || roleEl.value === 'assistant') ? roleEl.value : 'system',
          defaultPromptInChatDepth: injDepth && injDepth.value !== '' ? Math.max(0, Math.min(999, Number(injDepth.value))) : 0,
          apiMode: apiModeEl && apiModeEl.value === 'custom' ? 'custom' : 'main',
          apiOpenaiUrl: doc.getElementById('sp-api-url') ? doc.getElementById('sp-api-url').value : '',
          apiOpenaiKey: doc.getElementById('sp-api-key') ? doc.getElementById('sp-api-key').value : '',
          apiOpenaiModel: model,
        });
        // Instruction/tag/example/retry-context are authored content that travels with the card.
        if (spCharDefLoad()) {
          await spCharDefSave({
            tagStart: tagStartEl ? tagStartEl.value.trim() : '',
            tagEnd: tagEndEl ? tagEndEl.value.trim() : '',
            defaultPromptContent: defTa ? defTa.value : '',
            retryIncludePrev: !retryPrevEl || retryPrevEl.value !== '0',
          });
          spToast('已保存生成设置', '状态面板');
        } else {
          spToast('已保存引擎设置（当前角色没有面板定义，标记/指令等角色卡字段未写入）', '状态面板');
        }
        spSyncExtensionPrompt(); // role/depth/instruction may have changed — republish
        refreshAllAssistantPanels();
        bindPreview();
      } catch (e) {
        log('generate tab save failed', e);
        spToast(String(e && e.message ? e.message : e), '状态面板保存失败');
      }
    });
  }
}

// ─── 管理 tab ────────────────────────────────────────────────────────────────

/** Display name for a consent-list key (avatar filename); falls back to the stem. */
function spCharNameForKey(key) {
  try {
    const ctx = spGetSTContext();
    const hit = ctx && Array.isArray(ctx.characters)
      ? ctx.characters.find((c) => c && c.avatar === key)
      : null;
    if (hit && hit.name) return String(hit.name);
  } catch { /* ignore */ }
  return String(key || '').replace(/\.[^.]+$/, '');
}

function spRenderManageTab() {
  const state = spPanelState();
  const ch = spCurrentCharacter();
  const chName = ch && ch.name ? String(ch.name) : '';
  const def = spCharDefLoad();
  const eng = spEngineLoad();
  const allowed = eng.allowedCharacters || [];
  const dismissed = eng.dismissedCharacters || [];

  let stateBlock;
  if (!ch) {
    stateBlock = `<p class="sp-help-p">未选择角色或处于群聊，引擎空闲不工作。</p>`;
  } else if (state === 'none') {
    stateBlock = `
      <p class="sp-help-p">角色「${esc(chName)}」还没有状态栏定义。</p>
      <div class="sp-actions"><button type="button" class="sp-btn" id="sp-mg-create">为此角色创建状态栏</button></div>
      <p class="sp-help-p" style="font-size:11px;opacity:.7;">先在角色卡写入空定义并启用，再到「字段」页添加字段。</p>`;
  } else if (state === 'consent') {
    stateBlock = `
      <p class="sp-help-p">角色卡「${esc(chName)}」包含状态栏设计，尚未启用。</p>
      <div class="sp-actions">
        <button type="button" class="sp-btn" id="sp-mg-enable">启用</button>
        <button type="button" class="sp-btn" id="sp-mg-dismiss">忽略</button>
      </div>`;
  } else if (state === 'dismissed') {
    stateBlock = `
      <p class="sp-help-p">「${esc(chName)}」的状态栏已被忽略（定义仍在卡上）。</p>
      <div class="sp-actions"><button type="button" class="sp-btn" id="sp-mg-enable">启用</button></div>`;
  } else {
    stateBlock = `
      <p class="sp-help-p">「${esc(chName)}」的状态栏已启用。</p>
      <div class="sp-actions"><button type="button" class="sp-btn" id="sp-mg-disable">停用（保留角色卡上的定义）</button></div>`;
  }

  const dangerBlock = def && ch ? `
    <div>
      <label class="sp-label">危险操作</label>
      <div class="sp-actions"><button type="button" class="sp-btn sp-btn-danger" id="sp-mg-delete">删除面板定义</button></div>
      <p class="sp-help-p" style="font-size:11px;opacity:.7;">从角色卡永久删除字段与排版，无法撤销。</p>
    </div>` : '';

  const listHtml = (keys, kind) => keys.length
    ? keys.map((k) =>
        `<div class="sp-manage-row">` +
          `<span class="sp-manage-name">${esc(spCharNameForKey(k))}</span>` +
          `<span class="sp-manage-key">${esc(k)}</span>` +
          `<button type="button" class="sp-btn sp-btn-sm" data-sp-mg-remove="${kind}" data-sp-mg-key="${esc(k)}">移除</button>` +
        `</div>`,
      ).join('')
    : '<p class="sp-help-p" style="opacity:.6;">（无）</p>';

  return `
    <div>
      <label class="sp-label">当前角色</label>
      ${stateBlock}
    </div>
    ${dangerBlock}
    <div>
      <label class="sp-label">已启用的角色</label>
      ${listHtml(allowed, 'allowed')}
    </div>
    <div>
      <label class="sp-label">已忽略的角色</label>
      ${listHtml(dismissed, 'dismissed')}
    </div>
    <div>
      <label class="sp-label">工具</label>
      <div class="sp-actions">
        <button type="button" class="sp-btn" id="sp-mg-clear-chat">清除聊天数据</button>
        <button type="button" class="sp-btn" id="sp-mg-reset-engine">重置引擎设置</button>
      </div>
      <p class="sp-help-p" style="font-size:11px;opacity:.7;">重置只影响本机 API/生成配置，不改角色卡，也不清空名单。</p>
    </div>
  `;
}

function spBindManageTab() {
  const doc = chatDoc();
  const rerender = () => {
    renderPanelContent();
    refreshAllAssistantPanels();
  };
  const on = (id, fn) => {
    const el = doc.getElementById(id);
    if (el) el.addEventListener('click', fn);
  };

  on('sp-mg-create', async () => {
    try {
      await spCharDefSave({}); // writes the template skeleton + implies consent
      spToast('已在角色卡上创建状态栏定义 — 请在「字段」页添加字段', '状态面板');
      spCurrentTab = 'fields';
      rerender();
    } catch (e) {
      log('manage create failed', e);
      spToast(String(e && e.message ? e.message : e), '状态面板保存失败');
    }
  });

  on('sp-mg-enable', () => {
    spAllowCharacter();
    spToast('已启用此角色的状态栏', '状态面板');
    rerender();
  });

  on('sp-mg-dismiss', () => {
    spDismissCharacter();
    spToast('已忽略此角色的状态栏', '状态面板');
    rerender();
  });

  on('sp-mg-disable', () => {
    spDisableCharacter();
    spToast('已停用（角色卡上的定义已保留）', '状态面板');
    rerender();
  });

  on('sp-mg-delete', async () => {
    const root = window.parent && window.parent !== window ? window.parent : window;
    let ok = false;
    try {
      ok = root.confirm('确定要从角色卡中删除状态栏定义吗？此操作会写入角色卡，无法撤销。');
    } catch { ok = false; }
    if (!ok) return;
    try {
      await spCharDefDelete();
      spToast('已从角色卡删除状态栏定义', '状态面板');
      rerender();
    } catch (e) {
      log('manage delete failed', e);
      spToast(String(e && e.message ? e.message : e), '状态面板');
    }
  });

  doc.querySelectorAll('[data-sp-mg-remove]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const kind = btn.getAttribute('data-sp-mg-remove');
      const key = btn.getAttribute('data-sp-mg-key');
      const eng = spEngineLoad();
      if (kind === 'allowed') {
        spEngineSave({ allowedCharacters: (eng.allowedCharacters || []).filter((k) => k !== key) });
      } else {
        spEngineSave({ dismissedCharacters: (eng.dismissedCharacters || []).filter((k) => k !== key) });
      }
      spToast('已从名单移除 — 该角色恢复为「询问是否启用」状态', '状态面板');
      rerender();
    });
  });

  on('sp-mg-clear-chat', () => spShowClearModal());
  on('sp-mg-reset-engine', () => {
    spEngineReset();
    spToast('已重置引擎设置（角色卡与启用名单不受影响）', '状态面板');
    rerender();
  });
}

// ─── open / close ────────────────────────────────────────────────────────────

/**
 * @param {string} [tab] - Optional tab to open on (e.g. guidance card jumps to
 *   'fields'/'styles'). Without an explicit tab, a not-yet-enabled character lands
 *   on 管理 — the only tab with meaningful actions in that state.
 */
function openPanel(tab) {
  if (typeof tab === 'string' && tab) spCurrentTab = tab;
  else if (!spPanelEnabled()) spCurrentTab = 'manage';
  ensurePanelShell();
  const doc = chatDoc();
  const panel = doc.getElementById(SP_PANEL_ID);
  if (!panel) return;
  panel.classList.add('sp-panel-open');
  const saved = panelPosLoad();
  if (saved && typeof saved.top === 'number' && typeof saved.left === 'number') {
    panel.style.setProperty('top', saved.top + 'px', 'important');
    panel.style.setProperty('left', saved.left + 'px', 'important');
    panel.style.setProperty('right', 'auto', 'important');
    panel.style.setProperty('bottom', 'auto', 'important');
  } else {
    const pw = panel.offsetWidth || 380;
    const ph = panel.offsetHeight || 420;
    panel.style.setProperty(
      'top',
      Math.round((window.parent.innerHeight - ph) / 2) + 'px',
      'important',
    );
    panel.style.setProperty(
      'left',
      Math.round((window.parent.innerWidth - pw) / 2) + 'px',
      'important',
    );
    panel.style.setProperty('right', 'auto', 'important');
    panel.style.setProperty('bottom', 'auto', 'important');
  }
  renderPanelContent();
}

function closePanel() {
  const doc = chatDoc();
  const panel = doc.getElementById(SP_PANEL_ID);
  if (!panel) return;
  panel.classList.remove('sp-panel-open');
}

window.__spOpenPanel = openPanel;
window.__spClosePanel = closePanel;

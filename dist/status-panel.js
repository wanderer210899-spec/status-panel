(() => {
  const log = (...args) => console.log('[status-panel]', ...args);

  let parentDoc, parent$;
  try {
    parentDoc = window.parent.document;
    parent$ = window.parent.$;
  } catch (e) {
    log('Failed to access parent:', e);
  }

  // ─── constants.js ────────────────────────────────────────────────

  // ─── Namespace / DOM ids ───────────────────────────────────────────────────
  
  const SP_NS = 'sp-status-panel';
  const SP_BLOCK_STYLE_ID = `${SP_NS}-block-style`;
  const SP_PANEL_STYLE_ID = `${SP_NS}-panel-style`;
  const SP_PANEL_ID = `${SP_NS}-panel`;
  /** No longer created (floating FAB removed) — kept only so a leftover FAB from a
   *  previously-loaded build gets swept by dispose (top-doc element, survives an
   *  iframe-only reload). */
  const SP_FAB_ID = `${SP_NS}-fab`;
  
  /** Message `data` key for per-swipe persistence. */
  const SP_CHAT_STATUS_KEY = 'statusPanel';
  /** Extra metadata stored alongside `statusPanel` (TH seems to preserve top-level keys reliably). */
  const SP_CHAT_META_KEY = '_spStatusPanelMeta';
  /** Per-swipe parse-error info stored when marker JSON is invalid; cleared on successful parse. */
  const SP_CHAT_PARSE_ERROR_KEY = '_spParseError';
  
  /** Default marker delimiters for the AI's status block (HTML comments — invisible in chat if anything fails). */
  const MARKER_START = '<!--status-panel-->';
  const MARKER_END = '<!--/status-panel-->';
  
  /** Consent banner DOM id (card carries a panel definition the user hasn't approved yet). */
  const SP_CONSENT_ID = `${SP_NS}-consent`;
  
  /** Guidance card DOM id (panel enabled but the definition is still empty). */
  const SP_GUIDANCE_ID = `${SP_NS}-guidance`;
  
  /** ctx.setExtensionPrompt slot key for the auto-injected AI instruction. */
  const SP_EXT_PROMPT_KEY = 'status_panel_instructions';
  
  /** Inline messages for status block UI (single source of truth) */
  const SP_UI_TEXT = {
    noMarkersManual: '暂无状态数据 — 点击「🔄 重试」生成，或「✏ 编辑」手动填入。',
    generationFailed: '状态生成失败',
  };
  
  /**
   * Appended to every panel iframe srcdoc after body markup.
   * Outbound: height resize, action clicks. Inbound: pending state for retry buttons.
   * Escaped closing script tag keeps the bundle string literal intact.
   */
  const SP_IFRAME_BRIDGE = `<script>
  (function () {
    var lastPosted = -1;
    var raf = 0;
    function reportHeight() {
      if (raf) return;
      raf = requestAnimationFrame(function () {
        raf = 0;
        var el = document.body || document.documentElement;
        var h = el ? Math.ceil(Math.max(0, el.scrollHeight)) : 0;
        if (Math.abs(h - lastPosted) < 2) return;
        lastPosted = h;
        parent.postMessage({ type: 'sp-resize', height: h }, '*');
      });
    }
    new ResizeObserver(reportHeight).observe(document.body || document.documentElement);
    reportHeight();
  
    document.addEventListener('click', function (e) {
      // 按钮折叠: the ⋯ chip toggles the action row.
      var fold = e.target && e.target.closest('.sp-fold-toggle');
      if (fold) {
        var wrap = fold.closest('.sp-actions-fold');
        if (wrap) wrap.classList.toggle('sp-fold-open');
        return;
      }
      var el = e.target && e.target.closest('[data-sp-action]');
      if (el) { parent.postMessage({ type: 'sp-action', action: el.dataset.spAction }, '*'); return; }
      // Tap elsewhere inside the panel collapses an open fold.
      var open = document.querySelector('.sp-actions-fold.sp-fold-open');
      if (open) open.classList.remove('sp-fold-open');
    });
  
    window.addEventListener('message', function (e) {
      if (!e.data || e.data.type !== 'sp-state') return;
      var retryBtns = document.querySelectorAll('[data-sp-action="retry"]');
      retryBtns.forEach(function (btn) {
        btn.disabled = !!e.data.pending;
        btn.textContent = e.data.pending ? '⏳ 生成中' : (btn.dataset.spLabel || btn.textContent);
      });
    });
  })();
  <\/script>`;
  
  /** Default Retry / Edit row; `{sp_actions}` in templates expands to this HTML.
   *  Settings is intentionally absent (S10) — it's reachable via the SP 面板 button. */
  const SP_DEFAULT_ACTIONS_HTML =
    '<div class="sp-actions-wrap">' +
    '<button type="button" class="sp-btn-retry" data-sp-action="retry" data-sp-label="🔄 重试">🔄 重试</button>' +
    '<button type="button" class="sp-btn-edit" data-sp-action="edit" data-sp-label="✏ 编辑">✏ 编辑</button>' +
    '</div>';
  

  // ─── store.js ────────────────────────────────────────────────────

  // ─── Storage layers ──────────────────────────────────────────────────────────
  //
  // Layer A — engine settings (per-user): TavernHelper GLOBAL variables under
  //           `SP_ENGINE_VAR_KEY`. Sync with ST settings, never written to cards.
  //           API endpoint/key, render prefs, generation tuning, consent lists.
  // Layer B — panel definition (per-character): card `data.extensions.status_panel`
  //           written via `ctx.writeExtensionField` — the same mechanism regex
  //           scoped scripts use. Travels with the exported card PNG.
  // Layer C — status values (per-message/swipe): `message.data.statusPanel`
  //           via TH.setChatMessages (see helpers.js) — not handled here.
  
  const SP_ENGINE_VAR_KEY = 'status_panel_engine';
  const SP_CARD_EXT_KEY = 'status_panel';
  
  /** Engine-level settings — per-user, never exported with a card. */
  const SP_ENGINE_DEFAULTS = {
    renderMode: 'last_only',
  
    apiMode: 'main',
    apiOpenaiUrl: '',
    apiOpenaiKey: '',
    apiOpenaiModel: '',
  
    /** Injection role + depth for the status instruction — applies to BOTH generation
     *  paths (native extension-prompt inject and the manual 重试 generateRaw call).
     *  Depth 0 = bottom of the assembled prompt, maximum impact. */
    defaultPromptRole: 'system',
    defaultPromptInChatDepth: 0,
  
    /** Consent lists — card avatar filenames (same identity key ST uses for character_allowed_regex). */
    allowedCharacters: [],
    dismissedCharacters: [],
  };
  
  /** Default AI instruction preamble for new panel definitions (audience is Chinese). */
  const SP_DEFAULT_PREAMBLE_ZH =
    '角色状态追踪 — 仅供状态栏 UI 使用，不属于剧情正文。\n\n' +
    '完成正文回复后，请从刚刚发生的剧情中提取角色当前的真实状态，并在回复最末尾追加一个状态数据块。\n' +
    '数值必须反映当前时刻的真实状态 — 不是之前的状态，也不是假设的状态。';
  
  /**
   * Keys allowed inside the card definition (`data.extensions.status_panel`).
   * Enforcement point for the invariant "engine settings never touch the card":
   * spCharDefSave filters every write to this list, so an API key or consent list
   * can never leak into an exported card. Adding a card-level field? Add it here too.
   */
  const SP_CARD_ALLOWED_KEYS = [
    'version',
    'fields',
    'htmlTemplate',
    'css',
    'defaultPromptContent',
    'tagStart',
    'tagEnd',
    'designMode',
    'theme',
    'exampleUseDefaults', // deprecated & ignored (output block now always uses placeholders); kept whitelisted so legacy cards don't trip strip-warnings
    'retryIncludePrev',
  ];
  
  /** Skeleton for a freshly created per-character panel definition. */
  const SP_CHARDEF_TEMPLATE = {
    version: 2,
    fields: [],
    htmlTemplate: '',
    css: '',
    defaultPromptContent: SP_DEFAULT_PREAMBLE_ZH,
    /** Status-block tag override; empty = default HTML-comment markers.
     *  Lets authors port panels whose prompts already emit e.g. <StatusBlock>…</StatusBlock>. */
    tagStart: '',
    tagEnd: '',
    /** 样式 tab mode: 'simple' drives the layoutgen generator, 'advanced' is raw HTML+CSS paste. */
    designMode: 'simple',
    /** 简易 mode theme knobs consumed by spGenerateLayoutHtml. */
    theme: { accent: '#7c9cff', radius: 12, textSize: 13 },
    /** 重试 also sends the previous message's known status values for numeric continuity. */
    retryIncludePrev: true,
  };
  
  /** Starter field set for the 「使用示例字段」 button. */
  const SP_SAMPLE_FIELDS = [
    { name: '时间', type: 'text', value: '', hint: '当前的时间或时段，例如：深夜、清晨七点' },
    { name: '地点', type: 'text', value: '', hint: '当前所在的具体地点，例如：厨房、天台咖啡馆' },
    { name: '心情', type: 'text', value: '', hint: '当前情绪，用 1–3 个词描述，例如：紧张、暗自欣喜' },
    { name: '好感度', type: 'number', value: 50, min: 0, max: 100, hint: '对用户的好感 — 0 敌对，50 中立，100 倾心' },
    { name: '着装', type: 'text', value: '', hint: '角色当前穿着' },
    { name: '内心想法', type: 'text', value: '', hint: '第一人称的内心独白，1–2 句，未说出口' },
  ];
  
  /** Definition-shaped keys always present on the composed config, even with no definition. */
  const SP_CONFIG_BASE = {
    fields: [],
    htmlTemplate: '',
    css: '',
    defaultPromptContent: SP_DEFAULT_PREAMBLE_ZH,
    tagStart: '',
    tagEnd: '',
    designMode: 'simple',
    theme: { accent: '#7c9cff', radius: 12, textSize: 13 },
    retryIncludePrev: true,
  };
  
  function deepMerge(base, override) {
    if (override === undefined || override === null) return base;
    if (typeof override !== 'object' || Array.isArray(override)) return override;
    const out = Array.isArray(base) ? [...base] : { ...base };
    for (const k of Object.keys(override)) {
      const v = override[k];
      const b = base[k];
      if (v && typeof v === 'object' && !Array.isArray(v) && b && typeof b === 'object' && !Array.isArray(b)) {
        out[k] = deepMerge(b, v);
      } else if (v !== undefined) {
        out[k] = v;
      }
    }
    return out;
  }
  
  // ─── SillyTavern context / current character ────────────────────────────────
  
  function spGetSTContext() {
    try {
      const root = window.parent && window.parent !== window ? window.parent : window;
      const ST = root.SillyTavern || (typeof SillyTavern !== 'undefined' ? SillyTavern : null);
      return ST && typeof ST.getContext === 'function' ? ST.getContext() : null;
    } catch {
      return null;
    }
  }
  
  /** Current character object, or null when none is selected or a group chat is open (out of scope). */
  function spCurrentCharacter() {
    const ctx = spGetSTContext();
    if (!ctx) return null;
    if (ctx.groupId != null && ctx.groupId !== '') return null;
    const id = ctx.characterId;
    if (id == null || id === '' || !ctx.characters) return null;
    return ctx.characters[id] || null;
  }
  
  function spCurrentCharKey() {
    const ch = spCurrentCharacter();
    return ch && ch.avatar ? String(ch.avatar) : null;
  }
  
  // ─── Layer B: per-character panel definition (card extension data) ──────────
  
  function spCharDefLoad() {
    const ch = spCurrentCharacter();
    const def = ch && ch.data && ch.data.extensions ? ch.data.extensions[SP_CARD_EXT_KEY] : null;
    return def && typeof def === 'object' ? def : null;
  }
  
  /** Drop any key not on SP_CARD_ALLOWED_KEYS; warn once per stripped key set (S11). */
  function spFilterCardKeys(obj, context) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
    const out = {};
    const stripped = [];
    for (const k of Object.keys(obj)) {
      if (SP_CARD_ALLOWED_KEYS.indexOf(k) !== -1) out[k] = obj[k];
      else stripped.push(k);
    }
    if (stripped.length) {
      log(`spCharDefSave: refused non-card keys${context ? ' (' + context + ')' : ''}:`, stripped.join(', '));
      try { spToast('已拦截非角色卡字段（不写入卡片）：' + stripped.join('、'), '状态面板'); } catch { /* ignore */ }
    }
    return out;
  }
  
  async function spCharDefSave(patch) {
    const ctx = spGetSTContext();
    const ch = spCurrentCharacter();
    if (!ctx || !ch || typeof ctx.writeExtensionField !== 'function') {
      throw new Error('无法保存到角色卡（未选择角色，或群聊模式）');
    }
    // Whitelist enforcement: filter the incoming patch AND the merged result so engine
    // settings (API keys, consent lists) can never reach the card — even a pre-polluted def.
    const safePatch = spFilterCardKeys(patch || {}, 'patch');
    const next = spFilterCardKeys(deepMerge(spCharDefLoad() || SP_CHARDEF_TEMPLATE, safePatch), 'merged');
    next.version = 2;
    await ctx.writeExtensionField(ctx.characterId, SP_CARD_EXT_KEY, next);
    // Editing/creating a panel locally implies consent for this character.
    spAllowCharacter();
    return next;
  }
  
  async function spCharDefDelete() {
    const ctx = spGetSTContext();
    if (!ctx || typeof ctx.writeExtensionField !== 'function') return;
    await ctx.writeExtensionField(ctx.characterId, SP_CARD_EXT_KEY, null);
    const key = spCurrentCharKey();
    if (key) {
      const eng = spEngineLoad();
      spEngineSave({
        allowedCharacters: (eng.allowedCharacters || []).filter((k) => k !== key),
        dismissedCharacters: (eng.dismissedCharacters || []).filter((k) => k !== key),
      });
    }
  }
  
  // ─── Layer A: engine settings (TH global variables) ─────────────────────────
  
  function spEngineLoad() {
    const TH = getTH();
    let stored = null;
    try {
      if (TH && typeof TH.getVariables === 'function') {
        stored = TH.getVariables({ type: 'global' })[SP_ENGINE_VAR_KEY];
      }
    } catch (e) {
      log('spEngineLoad failed', e);
    }
    return deepMerge(SP_ENGINE_DEFAULTS, stored && typeof stored === 'object' ? stored : {});
  }
  
  function spEngineSave(patch) {
    const TH = getTH();
    if (!TH || typeof TH.insertOrAssignVariables !== 'function') {
      log('spEngineSave: insertOrAssignVariables unavailable');
      return null;
    }
    const next = deepMerge(spEngineLoad(), patch || {});
    TH.insertOrAssignVariables({ [SP_ENGINE_VAR_KEY]: next }, { type: 'global' });
    return next;
  }
  
  function spEngineReset() {
    const TH = getTH();
    if (!TH || typeof TH.insertOrAssignVariables !== 'function') return;
    // Preserve consent lists — resetting API prefs shouldn't disable characters.
    const eng = spEngineLoad();
    TH.insertOrAssignVariables(
      {
        [SP_ENGINE_VAR_KEY]: {
          ...SP_ENGINE_DEFAULTS,
          allowedCharacters: eng.allowedCharacters || [],
          dismissedCharacters: eng.dismissedCharacters || [],
        },
      },
      { type: 'global' },
    );
  }
  
  // ─── Consent / enablement ────────────────────────────────────────────────────
  
  function spIsCharacterAllowed() {
    const key = spCurrentCharKey();
    if (!key) return false;
    return (spEngineLoad().allowedCharacters || []).indexOf(key) !== -1;
  }
  
  function spAllowCharacter() {
    const key = spCurrentCharKey();
    if (!key) return;
    const eng = spEngineLoad();
    const allowed = eng.allowedCharacters || [];
    if (allowed.indexOf(key) !== -1) return;
    spEngineSave({
      allowedCharacters: [...allowed, key],
      dismissedCharacters: (eng.dismissedCharacters || []).filter((k) => k !== key),
    });
  }
  
  function spDismissCharacter() {
    const key = spCurrentCharKey();
    if (!key) return;
    const eng = spEngineLoad();
    const dismissed = eng.dismissedCharacters || [];
    if (dismissed.indexOf(key) !== -1) return;
    spEngineSave({ dismissedCharacters: [...dismissed, key] });
  }
  
  /** 停用 from the 管理 tab: revoke consent but keep the card definition; the
   *  character moves to 'dismissed' so no consent banner reappears until re-enabled. */
  function spDisableCharacter() {
    const key = spCurrentCharKey();
    if (!key) return;
    const eng = spEngineLoad();
    spEngineSave({
      allowedCharacters: (eng.allowedCharacters || []).filter((k) => k !== key),
      dismissedCharacters: (eng.dismissedCharacters || []).indexOf(key) !== -1
        ? eng.dismissedCharacters
        : [...(eng.dismissedCharacters || []), key],
    });
  }
  
  /**
   * Panel state for the current chat:
   *   'none'      — no definition (or group chat / no character): engine fully idle.
   *   'consent'   — card carries a definition the user hasn't approved yet: offer, don't spend.
   *   'dismissed' — user declined; idle until re-enabled via the settings panel.
   *   'enabled'   — definition approved: render + generate.
   */
  function spPanelState() {
    const key = spCurrentCharKey();
    if (!key) return 'none';
    const def = spCharDefLoad();
    if (!def) return 'none';
    const eng = spEngineLoad();
    if ((eng.allowedCharacters || []).indexOf(key) !== -1) return 'enabled';
    if ((eng.dismissedCharacters || []).indexOf(key) !== -1) return 'dismissed';
    return 'consent';
  }
  
  function spPanelEnabled() {
    return spPanelState() === 'enabled';
  }
  
  // ─── Composed config (consumer-facing; shape unchanged from v1) ──────────────
  
  function effectiveConfig() {
    const merged = deepMerge(deepMerge(SP_CONFIG_BASE, spEngineLoad()), spCharDefLoad() || {});
    if (merged.apiMode !== 'main' && merged.apiMode !== 'custom') merged.apiMode = 'main';
    if (Array.isArray(merged.fields)) {
      merged.fields = merged.fields.map((f) => {
        const o = { ...f };
        if (o.type === 'enum' && !Array.isArray(o.options)) o.options = [];
        if (o.hint == null) o.hint = '';
        return o;
      });
    }
    return merged;
  }
  
  // ─── Panel window position (cosmetic, device-local) ─────────────────────────
  
  const STATUS_PANEL_PANEL_POS_KEY = 'sp_status_panel_panel_pos_v1';
  
  function panelPosLoad() {
    try {
      return JSON.parse(localStorage.getItem(STATUS_PANEL_PANEL_POS_KEY) || 'null');
    } catch {
      return null;
    }
  }
  
  function panelPosSave(top, left) {
    localStorage.setItem(STATUS_PANEL_PANEL_POS_KEY, JSON.stringify({ top, left }));
  }
  

  // ─── schema.js ───────────────────────────────────────────────────

  // ─── JSON schema for generateRaw(json_schema) ───────────────────────────────
  
  function spFieldEnumOptions(f) {
    if (!f || !Array.isArray(f.options)) return [];
    const seen = new Set();
    const out = [];
    for (const o of f.options) {
      const s = String(o == null ? '' : o).trim();
      if (!s || seen.has(s)) continue;
      seen.add(s);
      out.push(s);
    }
    return out;
  }
  
  function statusFieldsToJsonSchema(fields) {
    const properties = {};
    const required = [];
    for (const f of fields || []) {
      const name = String(f.name || '').trim();
      if (!name) continue;
      required.push(name);
      const hint = f.hint ? String(f.hint).trim() : '';
      if (f.type === 'number') {
        const prop = { type: 'number' };
        const lo = Number(f.min);
        const hi = Number(f.max);
        if (Number.isFinite(lo)) prop.minimum = lo;
        if (Number.isFinite(hi)) prop.maximum = hi;
        if (hint) prop.description = hint;
        properties[name] = prop;
      } else if (f.type === 'enum') {
        const opts = spFieldEnumOptions(f);
        const prop = opts.length ? { type: 'string', enum: opts } : { type: 'string' };
        if (hint) prop.description = hint;
        properties[name] = prop;
      } else {
        const prop = { type: 'string' };
        if (hint) prop.description = hint;
        properties[name] = prop;
      }
    }
    return {
      type: 'object',
      properties,
      required,
      additionalProperties: false,
    };
  }
  

  // ─── parser.js ───────────────────────────────────────────────────

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
  

  // ─── helpers.js ──────────────────────────────────────────────────

  // ─── Escape / DOM context ───────────────────────────────────────────────────
  
  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  
  /** Field value escaping for iframe interpolation (includes apostrophe). */
  function spEscapeHtml(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  
  /** Prefer parent document when script runs in TavernHelper iframe */
  function chatDoc() {
    try {
      return window.parent && window.parent.document ? window.parent.document : document;
    } catch {
      return document;
    }
  }
  
  function getTH() {
    return typeof TavernHelper !== 'undefined' ? TavernHelper : null;
  }
  
  let spMessageBridgeBound = false;
  
  /** Panel iframe lives under chat document; nested iframe posts to that window, not the TH script window. */
  function spPanelMessageTargetWindow() {
    try {
      const v = chatDoc().defaultView;
      if (v) return v;
    } catch {
      /* ignore */
    }
    return window;
  }
  
  /**
   * Defer `fn` by `count` animation frames of the VISIBLE top window, never this script's
   * own window: the engine runs inside TavernHelper's `display:none` iframe, and Firefox
   * never fires rAF in non-rendered documents (Chrome does). A setTimeout safety net
   * guarantees `fn` still runs once if the top window's rAF is throttled or suspended
   * (backgrounded mobile tab).
   */
  function spDeferFrames(count, fn) {
    let done = false;
    const runOnce = () => {
      if (done) return;
      done = true;
      fn();
    };
    try {
      const v = spPanelMessageTargetWindow();
      if (v && typeof v.requestAnimationFrame === 'function') {
        let n = Math.max(1, count | 0);
        const step = () => {
          n -= 1;
          if (n <= 0) runOnce();
          else v.requestAnimationFrame(step);
        };
        v.requestAnimationFrame(step);
      }
    } catch {
      /* fall through to the timer */
    }
    setTimeout(runOnce, 200);
  }
  
  function spMountIframe(shellEl, srcdoc) {
    if (!shellEl) return null;
    const doc = shellEl.ownerDocument || document;
    const prev = shellEl.querySelector(':scope > iframe.sp-frame');
    if (prev) prev.remove();
    const iframe = doc.createElement('iframe');
    iframe.className = 'sp-frame';
    iframe.style.cssText =
      'width:100%;border:none;display:block;min-height:20px;transition:height 80ms ease;';
    iframe.setAttribute('sandbox', 'allow-scripts');
    shellEl.appendChild(iframe);
    const html = String(srcdoc || '');
    /**
     * Never assign `srcdoc` synchronously after ST finishes a huge `messageFormatting` pass:
     * parsing the iframe document + running the bridge script in the same turn as
     * `appendChild` into a massive `.mes_text` wedges the main thread (looks like a total freeze).
     * Yield two frames so layout/paint can complete, then hydrate the iframe.
     */
    spDeferFrames(2, () => {
      try {
        iframe.srcdoc = html;
      } catch (e) {
        console.error('[status-panel] iframe.srcdoc failed', e);
      }
    });
    return iframe;
  }
  
  function spBroadcastState(messageId, pending) {
    const doc = chatDoc();
    const roots = doc.querySelectorAll('.sp-block-root[data-sp-message-id]');
    const sid = String(messageId);
    for (let i = 0; i < roots.length; i++) {
      const root = roots[i];
      if (root.getAttribute('data-sp-message-id') !== sid) continue;
      const f = root.querySelector(':scope .sp-block-shell iframe.sp-frame');
      if (!f || !f.contentWindow) continue;
      try {
        f.contentWindow.postMessage({ type: 'sp-state', pending: !!pending }, '*');
      } catch {
        /* ignore */
      }
    }
  }
  
  function spInitBridge() {
    if (spMessageBridgeBound) return;
    spMessageBridgeBound = true;
    const tw = spPanelMessageTargetWindow();
  
    const onMsg = function (e) {
      const d = e.data;
      if (!d || typeof d.type !== 'string') return;
  
      if (d.type === 'sp-resize') {
        const iframes = chatDoc().querySelectorAll('iframe.sp-frame');
        const h = Math.ceil(Math.max(0, Number(d.height) || 0));
        for (let i = 0; i < iframes.length; i++) {
          const f = iframes[i];
          try {
            if (f.contentWindow === e.source) {
              const prev = parseInt(String(f.style.height || '0'), 10);
              if (Number.isFinite(prev) && Math.abs(prev - h) < 2) break;
              f.style.height = h + 'px';
              break;
            }
          } catch {
            /* ignore */
          }
        }
        return;
      }
  
      if (d.type === 'sp-action') {
        const iframes = chatDoc().querySelectorAll('iframe.sp-frame');
        let iframeEl = null;
        for (let i = 0; i < iframes.length; i++) {
          try {
            if (iframes[i].contentWindow === e.source) {
              iframeEl = iframes[i];
              break;
            }
          } catch {
            /* ignore */
          }
        }
        if (!iframeEl) return;
        const shell = iframeEl.parentElement;
        const root = shell && shell.closest ? shell.closest('.sp-block-root') : null;
        if (!root) return;
        const rawId = root.dataset.spMessageId;
        const mid = rawId != null && rawId !== '' ? Number(rawId) : NaN;
  
        if (d.action === 'retry') {
          if (!Number.isFinite(mid) || mid < 0) return;
          void spRetry(mid);
        } else if (d.action === 'edit') {
          if (!Number.isFinite(mid) || mid < 0) return;
          if (typeof spShowEditModal === 'function') spShowEditModal(mid);
        }
        // 设置 action removed (S10): settings opens via the SP 面板 toolbar button / FAB.
      }
    };
  
    tw.addEventListener('message', onMsg);
    spAddDisposer(() => {
      tw.removeEventListener('message', onMsg);
      spMessageBridgeBound = false;
    });
  }
  
  let spRuntimeDisposers = [];
  
  function spAddDisposer(disposer) {
    if (typeof disposer === 'function') spRuntimeDisposers.push(disposer);
  }
  
  function spDisposeRuntime() {
    while (spRuntimeDisposers.length > 0) {
      const disposer = spRuntimeDisposers.pop();
      try {
        disposer();
      } catch (e) {
        log('dispose failed:', e);
      }
    }
    // Reset global generation lock so new runtime doesn't wait on stale chains
    if (typeof spResetGenChain === 'function') spResetGenChain();
  
    // Withdraw the auto-injected AI instruction — a disposed engine must not keep
    // steering main generation. Re-init republishes it via refreshAllAssistantPanels.
    try {
      const ctx = spGetSTContext();
      if (ctx && typeof ctx.setExtensionPrompt === 'function') {
        ctx.setExtensionPrompt(SP_EXT_PROMPT_KEY, '', 1, 1, false, 0);
      }
    } catch (e) {
      log('extension prompt clear failed:', e);
    }
  
    const doc = chatDoc();
    doc.querySelectorAll('.sp-block-root').forEach((el) => el.remove());
    [SP_FAB_ID, SP_PANEL_ID, SP_CONSENT_ID, SP_GUIDANCE_ID, SP_BLOCK_STYLE_ID, SP_PANEL_STYLE_ID, `${SP_NS}-author-css`].forEach((id) => {
      const el = doc.getElementById(id);
      if (el) el.remove();
    });
  
    if (window.__spOpenPanel === openPanel) delete window.__spOpenPanel;
    if (window.__spClosePanel === closePanel) delete window.__spClosePanel;
    if (window[SP_NS] && window[SP_NS].dispose === spDisposeRuntime) delete window[SP_NS];
  }
  
  function spDisposePreviousRuntime() {
    try {
      const prev = window[SP_NS];
      if (prev && typeof prev.dispose === 'function') prev.dispose();
      else if (prev) {
        spDisposeRuntime();
        if (window[SP_NS] === prev) delete window[SP_NS];
      }
    } catch (e) {
      log('previous runtime dispose failed:', e);
    }
  }
  
  function spToast(text, title = 'Status Panel') {
    const t = typeof toastr !== 'undefined' ? toastr : null;
    if (t && typeof t.info === 'function') {
      t.info(text, title);
      return;
    }
    log(`${title}: ${text}`);
  }
  
  function spEventOn(eventType, listener) {
    const TH = getTH();
    const bind = TH && TH._bind;
    if (bind && typeof bind._eventOn === 'function') {
      return bind._eventOn.call(window, eventType, listener);
    }
    log('spEventOn: TavernHelper._bind._eventOn unavailable');
    return null;
  }
  
  function spBindEvent(eventType, listener) {
    const handle = spEventOn(eventType, listener);
    if (handle && typeof handle.stop === 'function') {
      spAddDisposer(() => handle.stop());
    }
    return handle;
  }
  
  /** Refcount: suppress MutationObserver-driven refreshes while we mutate the chat DOM (prevents tight refresh loops). */
  let spMutObsSuspendDepth = 0;
  
  function spMutationObserverSuspended() {
    return spMutObsSuspendDepth > 0;
  }
  
  function spWithMutationObserverSuspended(fn) {
    spMutObsSuspendDepth += 1;
    try {
      return fn();
    } finally {
      queueMicrotask(() => {
        spMutObsSuspendDepth -= 1;
      });
    }
  }
  
  async function spMergeChatMessageData(messageId, updater) {
    const TH = getTH();
    if (!TH || typeof TH.getChatMessages !== 'function' || typeof TH.setChatMessages !== 'function') return;
    const rows = TH.getChatMessages(String(messageId), { role: 'all', hide_state: 'all', include_swipes: false });
    const row = rows && rows[0];
    if (!row) return;
    const prev = row.data && typeof row.data === 'object' ? { ...row.data } : {};
    const next = typeof updater === 'function' ? updater(prev) : { ...prev, ...updater };
    // Data-only write: `refresh:'none'` still saves (debounced) but skips TH's refreshOneMessage,
    // which would empty `.mes_text`, re-run messageFormatting, and re-emit CHARACTER_MESSAGE_RENDERED.
    await TH.setChatMessages([{ message_id: messageId, data: next }], { refresh: 'none' });
  }
  
  function spGetMessageRow(messageId) {
    const TH = getTH();
    if (!TH || typeof TH.getChatMessages !== 'function') return null;
    const rows = TH.getChatMessages(String(messageId), { role: 'all', hide_state: 'all', include_swipes: false });
    return rows && rows[0] ? rows[0] : null;
  }
  
  function spGetMessageStatus(row) {
    if (!row || !row.data || typeof row.data !== 'object') return null;
    return row.data[SP_CHAT_STATUS_KEY] || null;
  }
  
  function spMesTextElement(messageId) {
    const TH = getTH();
    if (!TH || typeof TH.retrieveDisplayedMessage !== 'function') return null;
    const $mt = TH.retrieveDisplayedMessage(messageId);
    return $mt && $mt[0] ? $mt[0] : null;
  }
  
  function spStripInternalKeys(obj) {
    const o = {};
    for (const k of Object.keys(obj || {})) {
      if (k === '_spSource' || k === '_spPending' || k === '_sbSource' || k === '_sbPending') continue;
      o[k] = obj[k];
    }
    return o;
  }
  
  function spClampNumber(n, f) {
    let x = Number(n);
    if (!Number.isFinite(x)) x = 0;
    const lo = Number(f.min);
    const hi = Number(f.max);
    if (Number.isFinite(lo) && x < lo) x = lo;
    if (Number.isFinite(hi) && x > hi) x = hi;
    return x;
  }
  
  function spNormalizeValuesFromParsed(parsed, fields) {
    const out = {};
    for (const f of fields || []) {
      const name = String(f.name || '').trim();
      if (!name) continue;
      let v = parsed != null ? parsed[name] : undefined;
      if (v === undefined || v === null) {
        out[name] = '';
        continue;
      }
      if (f.type === 'number') {
        const n = Number(v);
        out[name] = Number.isFinite(n) ? spClampNumber(n, f) : '';
      } else if (f.type === 'enum') {
        const opts = typeof spFieldEnumOptions === 'function' ? spFieldEnumOptions(f) : (Array.isArray(f.options) ? f.options : []);
        const s = String(v);
        if (!opts.length || opts.indexOf(s) !== -1) out[name] = s;
        else {
          /** Case-insensitive recovery: keep the model's intent when casing drifts. */
          const lc = s.toLowerCase();
          const hit = opts.find((o) => String(o).toLowerCase() === lc);
          out[name] = hit || '';
        }
      } else {
        out[name] = String(v);
      }
    }
    return out;
  }
  
  /**
   * Marker signature stored in message meta to dedupe writes. Includes the field-name
   * set: hand-editing the schema after a block was parsed must invalidate the old sig,
   * or values normalized against the old (possibly empty) field list stay stale forever.
   */
  function spMarkerSig(rawValue, fields) {
    const names = (fields || []).map((f) => String(f.name || '').trim()).filter(Boolean);
    return spStableJsonStringify(spStripInternalKeys(rawValue)) + '|' + names.join(',');
  }
  
  function spLastAssistantMesIdFromDom() {
    const doc = chatDoc();
    const nodes = doc.querySelectorAll('#chat .mes[is_user="false"]');
    const last = nodes[nodes.length - 1];
    if (!last) return null;
    const mid = last.getAttribute('mesid');
    return mid != null && mid !== '' ? Number(mid) : null;
  }
  
  /**
   * Highest chat index whose message is not user (`mesid` === chat index).
   * Stable during swipe / edit re-renders; avoids transient DOM mismatches.
   */
  function spLastAssistantMesIdFromChat() {
    try {
      const w = typeof window !== 'undefined' ? window : null;
      const root = w && w.parent && w.parent !== w ? w.parent : w;
      const ST =
        root && root.SillyTavern ? root.SillyTavern : typeof SillyTavern !== 'undefined' ? SillyTavern : null;
      if (!ST || typeof ST.getContext !== 'function') return null;
      const ctx = ST.getContext();
      const chat = ctx && ctx.chat;
      if (!chat || !chat.length) return null;
      for (let i = chat.length - 1; i >= 0; i--) {
        const mes = chat[i];
        if (mes && mes.is_user === false) return i;
      }
      return null;
    } catch {
      return null;
    }
  }
  
  /** Prefer chat order; fall back to last assistant node in #chat. */
  function spLastAssistantMesId() {
    const fromChat = spLastAssistantMesIdFromChat();
    if (fromChat !== null) return fromChat;
    return spLastAssistantMesIdFromDom();
  }
  
  /** Serialize async work per message id (avoids duplicate generateRaw / races). */
  const spPerMessageChains = new Map();
  
  async function spWithPerMessageAsyncChain(messageId, fn) {
    const key = String(messageId);
    const prev = spPerMessageChains.get(key) || Promise.resolve();
    const next = prev.then(() => fn()).catch((e) => {
      log('per-message chain', messageId, e);
    });
    spPerMessageChains.set(key, next);
    return next;
  }
  

  // ─── styles.js ───────────────────────────────────────────────────

  // ─── Injected CSS (panel template + floating settings panel) ────────────────
  
  function injectStylesOnce() {
    const doc = chatDoc();
    if (!doc.getElementById(SP_BLOCK_STYLE_ID)) {
      const st = doc.createElement('style');
      st.id = SP_BLOCK_STYLE_ID;
      st.textContent =
        '/* status-panel: structural wrapper only — let the iframe theme own all visuals */\n' +
        '.sp-block-root{position:relative;max-width:100%;box-sizing:border-box;margin-top:10px;}\n' +
        '.sp-block-shell{display:block;min-width:0;color-scheme:light}\n' +
        '.sp-placeholder{font:12px/1.25 ui-monospace,monospace;padding:6px 8px;opacity:.75;}\n' +
        '.sp-placeholder-error{border-left:3px solid #c0392b;background:rgba(192,57,43,0.06);border-radius:4px;opacity:.95;word-break:break-word;}\n' +
        // Consent banner — card carries a panel definition awaiting user approval.
        '.sp-consent-bar{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px;' +
          'margin:10px;padding:10px 14px;border-radius:10px;border:1px solid rgba(120,180,255,.35);' +
          'background:rgba(60,120,220,.12);font:13px/1.45 system-ui,sans-serif;}\n' +
        '.sp-consent-actions{display:flex;gap:8px;}\n' +
        '.sp-consent-bar .sp-btn{cursor:pointer;font:12px/1 system-ui,sans-serif;padding:6px 14px;border-radius:8px;' +
          'border:1px solid rgba(255,255,255,.25);background:rgba(0,0,0,.25);color:inherit;}\n' +
        // Guidance card — same shell as the consent bar, green onboarding tint.
        '.sp-guidance-card{border-color:rgba(130,220,160,.35);background:rgba(60,180,110,.10);}\n' +
        '.sp-guidance-card .sp-consent-actions{flex-wrap:wrap;}\n' +
        // JSON parse error debug block — light-DOM, inside .mes_text, NOT inside the iframe.
        '.sp-json-error{margin:6px 0;border-left:3px solid #c0392b;padding:6px 8px;' +
          'background:rgba(192,57,43,0.06);border-radius:4px;' +
          'font:12px/1.4 ui-monospace,Consolas,monospace;color:#2c3e50;max-width:100%;box-sizing:border-box;}\n' +
        '.sp-json-error-hdr{color:#c0392b;font-weight:600;margin-bottom:4px;word-break:break-word;}\n' +
        '.sp-json-error-body{white-space:pre-wrap;word-break:break-word;margin:0;overflow-x:auto;}\n' +
        '.sp-json-tok-string-key{color:#b03060;}\n' +
        '.sp-json-tok-string-value{color:#27ae60;}\n' +
        '.sp-json-tok-number{color:#1f5fa8;}\n' +
        '.sp-json-tok-boolean,.sp-json-tok-null{color:#8e44ad;}\n' +
        '.sp-json-tok-punct{color:#555;}\n' +
        '.sp-json-tok-ws{}\n' +
        '.sp-json-tok-unknown{color:#c0392b;text-decoration:underline wavy #c0392b;}\n' +
        '.sp-json-tok-caret{color:#c0392b;font-weight:bold;}\n' +
        // Edit modal — host doc, not iframe; same z-index family as the clear modal.
        // Theme via --sp-* vars set inline on the overlay (spShowEditModal) so the editor
        // matches the active card's panel; opaque surface kept (it floats over the chat).
        // NOTE: height is 100vh, NOT inset:0/bottom:0. ST puts a transform+perspective on <html>,
        // which makes <html> the containing block for our position:fixed overlay; that box is
        // height-collapsed, so inset:0 gave the overlay ~0 height and the modal centred off-screen.
        // vh is viewport-relative regardless of containing block. Do not revert to inset:0.
        '.sp-edit-modal{position:fixed;top:0;left:0;right:0;height:100vh;background:rgba(0,0,0,.65);z-index:100001;display:flex;align-items:center;justify-content:center;overflow-y:auto;padding:16px;box-sizing:border-box;}\n' +
        '.sp-edit-modal .sp-edit-box{background:#1b1d27;border:1px solid var(--sp-border-color,rgba(255,255,255,.15));border-radius:var(--sp-radius,14px);padding:20px 22px;' +
          'max-width:520px;width:92%;max-height:88vh;display:flex;flex-direction:column;color:var(--sp-text-color,rgba(255,255,255,.92));' +
          'font:13px/1.45 var(--sp-font,system-ui,Segoe UI,Roboto,sans-serif);box-shadow:0 8px 32px rgba(0,0,0,.5);}\n' +
        '.sp-edit-modal .sp-em-title{margin:0 0 4px;font-size:15px;font-weight:650;color:var(--sp-title-color,var(--sp-accent,inherit));}\n' +
        '.sp-edit-modal .sp-em-sub{margin:0 0 14px;font-size:11px;opacity:.7;}\n' +
        '.sp-edit-modal .sp-em-fields{flex:1 1 auto;min-height:0;overflow-y:auto;display:flex;flex-direction:column;gap:12px;padding-right:4px;}\n' +
        '.sp-edit-modal .sp-em-row{display:flex;flex-direction:column;gap:4px;}\n' +
        '.sp-edit-modal .sp-em-label{font:600 11px/1.1 ui-monospace,monospace;text-transform:uppercase;letter-spacing:.06em;opacity:.75;}\n' +
        '.sp-edit-modal .sp-em-input{box-sizing:border-box;width:100%;padding:6px 8px;border-radius:8px;border:1px solid var(--sp-border-color,rgba(255,255,255,.18));' +
          'background:rgba(0,0,0,.32);color:var(--sp-text-color,rgba(255,255,255,.95));font:12px/1.4 ui-monospace,monospace;}\n' +
        '.sp-edit-modal .sp-em-textarea{min-height:54px;resize:vertical;}\n' +
        '.sp-edit-modal .sp-em-input:focus{outline:1px solid var(--sp-accent,rgba(160,140,255,.6));}\n' +
        '.sp-edit-modal .sp-em-hint{font-size:10px;opacity:.55;}\n' +
        '.sp-edit-modal .sp-em-actions{display:flex;align-items:center;gap:8px;margin-top:14px;padding-top:12px;border-top:1px solid rgba(255,255,255,.08);}\n' +
        '.sp-edit-modal .sp-em-btn{all:unset;cursor:pointer;box-sizing:border-box;padding:7px 14px;border-radius:9px;font-size:12px;' +
          'border:1px solid var(--sp-btn-border-color,rgba(255,255,255,.18));background:var(--sp-btn-color,rgba(0,0,0,.3));color:var(--sp-btn-text-color,inherit);}\n' +
        '.sp-edit-modal .sp-em-btn:hover{filter:brightness(1.15);}\n' +
        '.sp-edit-modal .sp-em-btn-save{border-color:var(--sp-accent,rgba(160,140,255,.45));background:color-mix(in srgb, var(--sp-accent,#6e5ac8) 32%, transparent);font-weight:600;}\n' +
        '.sp-edit-modal .sp-em-btn-reset{opacity:.7;font-size:11px;}\n';
      doc.head.appendChild(st);
    }
    if (!doc.getElementById(SP_PANEL_STYLE_ID)) {
      const st2 = doc.createElement('style');
      st2.id = SP_PANEL_STYLE_ID;
      st2.textContent = `
        #${SP_PANEL_ID} {
          position: fixed;
          z-index: 99999;
          width: min(420px, calc(100vw - 16px));
          max-height: min(80vh, calc(100vh - 16px));
          display: none;
          flex-direction: column;
          border-radius: 12px;
          border: 1px solid rgba(255,255,255,0.14);
          background: rgba(22,22,28,0.96);
          box-shadow: 0 12px 40px rgba(0,0,0,0.45);
          overflow: hidden;
          font: 13px/1.35 system-ui, Segoe UI, Roboto, sans-serif;
          color: rgba(255,255,255,0.92);
        }
        #${SP_PANEL_ID}.sp-panel-open { display: flex; }
        #${SP_PANEL_ID} .sp-panel-header {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 12px;
          cursor: move;
          user-select: none;
          touch-action: none;
          border-bottom: 1px solid rgba(255,255,255,0.08);
          background: rgba(0,0,0,0.25);
        }
        #${SP_PANEL_ID} .sp-panel-title { font-weight: 600; flex: 1; }
        #${SP_PANEL_ID} .sp-panel-close {
          all: unset;
          cursor: pointer;
          padding: 4px 8px;
          border-radius: 8px;
          opacity: 0.85;
        }
        #${SP_PANEL_ID} .sp-panel-close:hover { background: rgba(255,255,255,0.08); }
        #${SP_PANEL_ID} .sp-tabs {
          display: flex;
          gap: 4px;
          padding: 8px 8px 0;
          border-bottom: 1px solid rgba(255,255,255,0.08);
          flex-wrap: wrap;
        }
        #${SP_PANEL_ID} .sp-tab {
          all: unset;
          cursor: pointer;
          padding: 6px 10px;
          border-radius: 8px 8px 0 0;
          opacity: 0.75;
          font-size: 12px;
        }
        #${SP_PANEL_ID} .sp-tab.sp-tab-active {
          opacity: 1;
          background: rgba(255,255,255,0.08);
        }
        #${SP_PANEL_ID} .sp-panel-body {
          padding: 12px;
          overflow-x: hidden;
          overflow-y: auto;
          -webkit-overflow-scrolling: touch;
          overscroll-behavior: contain;
          touch-action: pan-y;
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        #${SP_PANEL_ID} label.sp-label { font-size: 11px; opacity: 0.75; display: block; margin-bottom: 4px; }
        #${SP_PANEL_ID} input[type="text"], #${SP_PANEL_ID} input[type="password"], #${SP_PANEL_ID} input[type="number"], #${SP_PANEL_ID} textarea, #${SP_PANEL_ID} select {
          width: 100%;
          box-sizing: border-box;
          padding: 8px;
          border-radius: 8px;
          border: 1px solid rgba(255,255,255,0.12);
          background: rgba(0,0,0,0.35);
          color: inherit;
          font: 12px/1.35 ui-monospace, monospace;
        }
        #${SP_PANEL_ID} textarea { min-height: 72px; resize: vertical; }
        #${SP_PANEL_ID} div.sp-prompt-preview {
          width: 100%;
          box-sizing: border-box;
          padding: 8px;
          border-radius: 8px;
          border: 1px solid rgba(255,255,255,0.12);
          background: rgba(0,0,0,0.35);
          color: inherit;
          min-height: 160px;
          max-height: min(42vh, 420px);
          overflow-y: auto;
          -webkit-overflow-scrolling: touch;
          overscroll-behavior: contain;
          touch-action: pan-y;
          font: 11px/1.45 ui-monospace, monospace;
        }
        #${SP_PANEL_ID} .sp-prev-meta {
          font-size: 10px; opacity: .62; margin-bottom: 8px; line-height: 1.4;
        }
        #${SP_PANEL_ID} .sp-prev-sec-head {
          font: 700 9px/1 ui-monospace,monospace; text-transform: uppercase;
          letter-spacing: .06em; opacity: .4; margin: 8px 0 4px;
        }
        #${SP_PANEL_ID} .sp-prev-block {
          margin-bottom: 4px; border-radius: 5px; border-left: 3px solid;
          padding: 5px 8px; word-break: break-word;
        }
        #${SP_PANEL_ID} .sp-prev-builtin { border-color: rgba(160,160,160,.4); background: rgba(255,255,255,.03); }
        #${SP_PANEL_ID} .sp-prev-preset { border-color: rgba(80,140,220,.55); background: rgba(80,140,220,.07); }
        #${SP_PANEL_ID} .sp-prev-sp { border-color: rgba(80,200,120,.55); background: rgba(80,200,120,.07); }
        #${SP_PANEL_ID} .sp-prev-schema { border-color: rgba(220,160,50,.55); background: rgba(220,160,50,.07); }
        #${SP_PANEL_ID} .sp-prev-inject { border-color: rgba(160,100,220,.55); background: rgba(160,100,220,.07); }
        #${SP_PANEL_ID} .sp-prev-hdr {
          display: flex; flex-wrap: wrap; align-items: center; gap: 4px;
          margin-bottom: 3px; font-size: 10px;
        }
        #${SP_PANEL_ID} .sp-prev-idx { opacity: .4; font-size: 9px; }
        #${SP_PANEL_ID} .sp-prev-badge {
          display: inline-block; padding: 1px 5px; border-radius: 3px;
          font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em;
        }
        #${SP_PANEL_ID} .sp-badge-builtin { background: rgba(160,160,160,.2); color: rgba(200,200,200,.8); }
        #${SP_PANEL_ID} .sp-badge-preset { background: rgba(80,140,220,.25); color: rgba(140,190,255,.9); }
        #${SP_PANEL_ID} .sp-badge-sp { background: rgba(80,200,120,.25); color: rgba(130,230,160,.9); }
        #${SP_PANEL_ID} .sp-badge-schema { background: rgba(220,160,50,.25); color: rgba(255,200,100,.9); }
        #${SP_PANEL_ID} .sp-badge-inject { background: rgba(160,100,220,.25); color: rgba(200,160,255,.9); }
        #${SP_PANEL_ID} .sp-prev-name { font-weight: 600; opacity: .9; }
        #${SP_PANEL_ID} .sp-prev-source { opacity: .52; font-style: italic; }
        #${SP_PANEL_ID} .sp-prev-depth { opacity: .5; font-size: 9px; }
        #${SP_PANEL_ID} .sp-prev-placeholder {
          font-style: italic; opacity: .52; font-size: 10px; line-height: 1.35;
        }
        #${SP_PANEL_ID} .sp-prev-content {
          white-space: pre-wrap; font-size: 10px; opacity: .82;
          max-height: 100px; overflow: hidden; line-height: 1.4;
        }
        #${SP_PANEL_ID} .sp-prev-schema-dt summary {
          cursor: pointer; opacity: .68; font-size: 10px; margin-bottom: 2px;
        }
        #${SP_PANEL_ID} .sp-prev-schema-dt[open] .sp-prev-content { max-height: 220px; }
        #${SP_PANEL_ID} #sp-def-prompt { min-height: 140px; }
        #${SP_PANEL_ID} .sp-preset-scroll {
          min-height: 72px;
          height: 160px;
          max-height: 160px;
          overflow: auto;
          border: 1px solid rgba(255,255,255,.08);
          padding: 6px;
          border-radius: 8px;
          box-sizing: border-box;
        }
        #${SP_PANEL_ID} .sp-preset-row {
          display: flex; align-items: center; gap: 5px;
          margin: 1px 0; padding: 3px 4px; border-radius: 4px; font-size: 11px;
        }
        #${SP_PANEL_ID} .sp-preset-row-builtin { opacity: .72; cursor: pointer; }
        #${SP_PANEL_ID} .sp-preset-row-builtin:hover { background: rgba(255,255,255,.05); }
        #${SP_PANEL_ID} .sp-preset-row-excluded { opacity: .38 !important; text-decoration: line-through; }
        #${SP_PANEL_ID} .sp-preset-row-excluded .sp-preset-row-tag::after { content: ' ✕'; }
        #${SP_PANEL_ID} .sp-preset-row-empty { opacity: .42; }
        #${SP_PANEL_ID} .sp-preset-row-custom { cursor: pointer; }
        #${SP_PANEL_ID} .sp-preset-row-custom:hover { background: rgba(255,255,255,.05); }
        #${SP_PANEL_ID} .sp-prev-excluded-note { opacity: .7; font-size: 11px; }
        #${SP_PANEL_ID} .sp-preset-row input[type="checkbox"] { flex-shrink: 0; width: auto; margin: 0; }
        #${SP_PANEL_ID} .sp-preset-row-icon { opacity: .5; font-size: 10px; flex-shrink: 0; }
        #${SP_PANEL_ID} .sp-preset-row-name {
          flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        #${SP_PANEL_ID} .sp-preset-row-tag {
          flex-shrink: 0; font-size: 9px; font-weight: 700; padding: 1px 4px;
          border-radius: 3px; text-transform: uppercase; letter-spacing: .04em;
        }
        #${SP_PANEL_ID} .sp-preset-tag-builtin { background: rgba(160,160,160,.2); color: rgba(190,190,190,.7); }
        #${SP_PANEL_ID} .sp-preset-tag-empty { background: rgba(100,100,100,.2); color: rgba(140,140,140,.6); }
        #${SP_PANEL_ID} .sp-preset-tag-role { background: rgba(80,140,220,.2); color: rgba(140,190,255,.75); }
  #${SP_PANEL_ID} .sp-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; min-width: 0; }
        #${SP_PANEL_ID} .sp-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px; }
        #${SP_PANEL_ID} button.sp-btn {
          all: unset;
          cursor: pointer;
          padding: 6px 12px;
          border-radius: 8px;
          border: 1px solid rgba(255,255,255,0.14);
          background: rgba(255,255,255,0.06);
          font-size: 12px;
        }
        #${SP_PANEL_ID} button.sp-btn:hover { background: rgba(255,255,255,0.1); }
        #${SP_PANEL_ID} button.sp-btn-sm { padding: 3px 8px; font-size: 11px; opacity: 0.8; }
        #${SP_PANEL_ID} .sp-import-row { display: flex; gap: 6px; margin-bottom: 4px; }
        #${SP_PANEL_ID} .sp-field-list { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
        #${SP_PANEL_ID} .sp-field-card {
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 10px;
          padding: 10px;
          min-width: 0;
          background: rgba(0,0,0,0.18);
        }
        #${SP_PANEL_ID} .sp-field-card-head {
          display: grid;
          grid-template-columns: auto 1fr auto;
          gap: 8px;
          align-items: center;
          min-width: 0;
          margin-bottom: 8px;
        }
        #${SP_PANEL_ID} .sp-field-label-inline { margin: 0; white-space: nowrap; }
        #${SP_PANEL_ID} .sp-field-name { min-width: 0; }
        #${SP_PANEL_ID} .sp-field-row-split {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
          min-width: 0;
        }
        @media (max-width: 380px) {
          #${SP_PANEL_ID} .sp-field-row-split { grid-template-columns: 1fr; }
        }
        #${SP_PANEL_ID} .sp-field-cell { min-width: 0; display: flex; flex-direction: column; gap: 4px; }
        #${SP_PANEL_ID} .sp-field-range { margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.06); }
        #${SP_PANEL_ID} .sp-field-range .sp-label { margin-bottom: 4px; }
        #${SP_PANEL_ID} .sp-field-range-inputs {
          display: grid;
          grid-template-columns: 1fr auto 1fr;
          gap: 6px;
          align-items: center;
          min-width: 0;
        }
        #${SP_PANEL_ID} .sp-field-range-dash { opacity: 0.5; text-align: center; font-size: 12px; }
        #${SP_PANEL_ID} .sp-insert-field-brace { min-width: 0; flex: 1; }
        #${SP_PANEL_ID} .sp-preview-wrap {
          border: 1px solid rgba(255,255,255,0.12);
          border-radius: 8px;
          min-height: 80px;
          max-height: min(44vh, 440px);
          overflow: auto;
          isolation: isolate;
          background: rgba(255,255,255,0.04);
        }
        #${SP_PANEL_ID} .sp-help {
          font-size: 12px;
          line-height: 1.45;
          opacity: 0.92;
          padding: 8px 10px;
          border-radius: 8px;
          background: rgba(0,0,0,0.28);
          border: 1px solid rgba(255,255,255,0.08);
        }
        #${SP_PANEL_ID} .sp-help-p { margin: 0 0 8px 0; }
        #${SP_PANEL_ID} .sp-help-p:last-child { margin-bottom: 0; }
        #${SP_PANEL_ID} .sp-api-models-out {
          font-size: 11px;
          opacity: 0.88;
          max-height: min(28vh, 200px);
          overflow: auto;
          white-space: pre-wrap;
          word-break: break-word;
        }
        #${SP_PANEL_ID} .sp-insert-row { align-items: center; margin-top: 6px; }
        #${SP_PANEL_ID} .sp-preset-line { display: flex; align-items: flex-start; gap: 6px; margin: 2px 0; padding: 2px 4px; border-radius: 4px; cursor: pointer; }
        #${SP_PANEL_ID} .sp-preset-line:hover { background: rgba(255,255,255,0.05); }
        #${SP_PANEL_ID} .sp-preset-line input[type="checkbox"] { flex-shrink: 0; margin-top: 2px; width: auto; }
        #${SP_PANEL_ID} .sp-token-warnings {
          font-size: 11px;
          line-height: 1.5;
          padding: 7px 10px;
          border-radius: 8px;
          border: 1px solid rgba(230,180,60,0.45);
          background: rgba(200,140,20,0.12);
          color: rgba(255,220,150,0.95);
          word-break: break-word;
        }
        #${SP_PANEL_ID} .sp-theme-row { align-items: center; }
        #${SP_PANEL_ID} .sp-theme-row input[type="color"] {
          width: 44px;
          height: 26px;
          padding: 1px;
          border-radius: 6px;
          border: 1px solid rgba(255,255,255,0.18);
          background: rgba(0,0,0,0.3);
          cursor: pointer;
          vertical-align: middle;
        }
        #${SP_PANEL_ID} .sp-tag-row { align-items: center; }
        #${SP_PANEL_ID} .sp-tag-row input { min-width: 0; flex: 1; font-family: ui-monospace, monospace; }
        #${SP_PANEL_ID} details.sp-adv {
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 8px;
          padding: 8px 10px;
          background: rgba(0,0,0,0.18);
        }
        #${SP_PANEL_ID} details.sp-adv > summary {
          cursor: pointer;
          font-size: 12px;
          font-weight: 600;
          opacity: 0.85;
          user-select: none;
        }
        #${SP_PANEL_ID} details.sp-adv[open] > summary { margin-bottom: 10px; }
        #${SP_PANEL_ID} details.sp-adv > div { margin-bottom: 10px; }
        #${SP_PANEL_ID} details.sp-adv > div:last-child { margin-bottom: 0; }
        #${SP_PANEL_ID} .sp-manage-row {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 5px 8px;
          border-radius: 6px;
          border: 1px solid rgba(255,255,255,0.08);
          background: rgba(0,0,0,0.18);
          margin-bottom: 5px;
          min-width: 0;
        }
        #${SP_PANEL_ID} .sp-manage-name { font-size: 12px; font-weight: 600; flex-shrink: 0; }
        #${SP_PANEL_ID} .sp-manage-key {
          font: 10px/1.3 ui-monospace, monospace;
          opacity: 0.55;
          flex: 1;
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        #${SP_PANEL_ID} .sp-btn-danger {
          border-color: rgba(220,90,90,0.5);
          background: rgba(180,50,50,0.18);
        }
        #${SP_PANEL_ID} .sp-btn-danger:hover { background: rgba(200,60,60,0.3); }
        @media (hover: none) and (pointer: coarse) {
          #${SP_PANEL_ID} button.sp-btn { padding: 9px 14px; font-size: 13px; }
          #${SP_PANEL_ID} .sp-tab { padding: 8px 12px; }
          #${SP_PANEL_ID} .sp-panel-close { padding: 6px 12px; }
          #${SP_PANEL_ID} .sp-panel-body { gap: 14px; }
          #${SP_PANEL_ID} input[type="text"], #${SP_PANEL_ID} input[type="password"], #${SP_PANEL_ID} input[type="number"],
          #${SP_PANEL_ID} textarea, #${SP_PANEL_ID} select { padding: 10px; font-size: 13px; }
          #${SP_PANEL_ID} label.sp-label { font-size: 12px; }
          #${SP_PANEL_ID} .sp-preset-row { padding: 5px 6px; font-size: 12px; }
          #${SP_PANEL_ID} .sp-preset-row-tag { font-size: 10px; }
        }
      `;
      doc.head.appendChild(st2);
    }
  }
  
  /**
   * Author CSS is scoped inside each panel iframe under `.sp-iframe-root`. Selectors written with `:host`,
   * `.sp-block-shell`, or `.sp-block-root` are rewritten for compatibility; `:root` / `html` / `body` map
   * to `.sp-iframe-root`. Base typography lives in `spIframeBaseCss`.
   *
   * Trade-offs: tokenizer, not a full CSS parser; nesting (`&`) is preserved; `@keyframes` /
   * `@font-face` pass through.
   */
  const SP_IFRAME_AUTHOR_SCOPE = '.sp-iframe-root';
  const SP_NESTED_AT_BLOCK_RULES = new Set(['media', 'supports', 'container', 'layer', 'document', 'scope', '-moz-document']);
  const SP_PASSTHROUGH_AT_BLOCK_RULES = new Set([
    'keyframes', '-webkit-keyframes', '-moz-keyframes', '-o-keyframes',
    'font-face', 'page', 'counter-style', 'property', 'viewport', 'font-feature-values',
  ]);
  
  function spIframeMapLegacyHosts(inner) {
    if (inner.startsWith('.sp-block-shell')) {
      return SP_IFRAME_AUTHOR_SCOPE + inner.slice('.sp-block-shell'.length);
    }
    if (inner.startsWith('.sp-block-root')) {
      return SP_IFRAME_AUTHOR_SCOPE + inner.slice('.sp-block-root'.length);
    }
    return inner;
  }
  
  function spIframeBaseCss() {
    return (
      '/* status-panel: iframe root — defaults independent of .mes_text */\n' +
      '.sp-iframe-root{display:block;max-width:100%;overflow:visible;word-break:break-word;box-sizing:border-box;' +
      'color:#2c3e50;font-family:system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;' +
      'font-size:14px;line-height:1.45;-webkit-text-fill-color:currentColor;color-scheme:light}\n' +
      '.sp-iframe-root *{max-width:100%;box-sizing:border-box}\n'
    );
  }
  
  /**
   * Global panel stylesheet (S6): one engine-owned sheet applied to EVERY panel iframe,
   * before the (optional) author CSS. Structure + button alignment + badges are defined
   * once here; all colours/radius/font come from `--sp-*` CSS variables set per-card in
   * spBuildIframeSrcdoc. The 简易 generator emits only markup + bar widths; hand-written
   * 高级 templates get the same aligned buttons/badge for free (their own CSS still wins,
   * as it is scoped and comes later in source order).
   */
  const SP_IFRAME_GLOBAL_CSS =
    // 简易 layout scaffold.
    '.spg-card{font:var(--sp-text-size,13px)/1.6 var(--sp-font,system-ui,-apple-system,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif);' +
      'color:var(--sp-text-color,rgba(255,255,255,.92));background:rgba(12,14,20,.42);' +
      'border:1px solid var(--sp-border-color,#7c9cff);border-radius:var(--sp-radius,12px);padding:12px 14px;}\n' +
    '.spg-head{display:flex;align-items:center;gap:8px;margin-bottom:8px;}\n' +
    '.spg-title{font-weight:650;letter-spacing:.4px;color:var(--sp-title-color,var(--sp-accent,#7c9cff));}\n' +
    '.spg-head .sp-badge{margin-left:auto;}\n' +
    '.spg-rows{display:flex;flex-direction:column;gap:6px;}\n' +
    '.spg-row{display:flex;align-items:baseline;gap:10px;min-width:0;}\n' +
    '.spg-label{flex:0 0 auto;min-width:4.5em;opacity:.62;font-size:.92em;}\n' +
    '.spg-value{flex:1 1 auto;min-width:0;overflow-wrap:anywhere;}\n' +
    '.spg-row-num{align-items:center;}\n' +
    '.spg-bar{flex:1 1 auto;height:8px;border-radius:99px;background:rgba(255,255,255,.10);overflow:hidden;}\n' +
    '.spg-fill{display:block;height:100%;border-radius:99px;background:var(--sp-accent,#7c9cff);transition:width .35s ease;}\n' +
    '.spg-value-num{flex:0 0 auto;min-width:2.5em;text-align:right;font-variant-numeric:tabular-nums;}\n' +
    '.spg-pill{display:inline-block;padding:1px 10px;border-radius:99px;font-size:.92em;' +
      'background:color-mix(in srgb, var(--sp-accent,#7c9cff) 18%, transparent);' +
      'border:1px solid color-mix(in srgb, var(--sp-accent,#7c9cff) 45%, transparent);}\n' +
    // Action row + buttons — shared by every panel (S10: 重试 + 编辑 only, no 设置).
    '.sp-actions-wrap{display:flex;align-items:center;justify-content:flex-end;gap:8px;margin-top:10px;flex-wrap:wrap;}\n' +
    '.sp-btn-retry,.sp-btn-edit{all:unset;cursor:pointer;padding:2px 12px;border-radius:99px;font-size:.9em;' +
      'color:var(--sp-btn-text-color,inherit);' +
      'background:var(--sp-btn-color,color-mix(in srgb, var(--sp-accent,#7c9cff) 14%, transparent));' +
      'border:1px solid var(--sp-btn-border-color,color-mix(in srgb, var(--sp-accent,#7c9cff) 40%, transparent));}\n' +
    '.sp-btn-retry:hover,.sp-btn-edit:hover{filter:brightness(1.18);}\n' +
    '.sp-btn-retry:disabled{opacity:.45;cursor:not-allowed;}\n' +
    // 按钮折叠: ⋯ chip expands the row; tap-away (handled in the bridge) collapses it.
    '.sp-actions-fold{display:flex;flex-direction:column;align-items:flex-end;margin-top:8px;}\n' +
    '.sp-fold-toggle{all:unset;cursor:pointer;padding:0 10px;line-height:1.5;border-radius:99px;font-size:1.1em;opacity:.65;' +
      'border:1px solid var(--sp-btn-border-color,color-mix(in srgb, var(--sp-accent,#7c9cff) 40%, transparent));}\n' +
    '.sp-actions-fold .sp-actions-wrap{display:none;margin-top:6px;}\n' +
    '.sp-actions-fold.sp-fold-open .sp-actions-wrap{display:flex;}\n' +
    '.sp-actions-fold.sp-fold-open .sp-fold-toggle{opacity:1;}\n' +
    // Muted empty-value placeholder + source badge.
    '.sp-ph,.sp-ph-dash{font-style:italic;opacity:.55;}\n' +
    '.sp-badge{display:inline-block;font:10px/1 ui-monospace,monospace;padding:1px 6px;border-radius:999px;vertical-align:middle;' +
      'color:var(--sp-title-color,var(--sp-accent,#7c9cff));' +
      'background:color-mix(in srgb, var(--sp-accent,#7c9cff) 12%, transparent);' +
      'border:1px solid color-mix(in srgb, var(--sp-accent,#7c9cff) 45%, transparent);}\n' +
    '.sp-badge-error{color:#e05a5a;background:rgba(220,80,80,.12);border-color:rgba(220,80,80,.6);}\n' +
    // Generation-in-progress hint (retry button also shows ⏳ 生成中 via the bridge).
    '.sp-busy{opacity:.7;font-size:.85em;font-style:italic;}\n';
  
  function spCssSkipString(src, start) {
    const open = src[start];
    let j = start + 1;
    while (j < src.length) {
      const ch = src[j];
      if (ch === '\\') { j += 2; continue; }
      if (ch === open) return j + 1;
      j += 1;
    }
    return src.length;
  }
  
  function spCssSkipComment(src, start) {
    const end = src.indexOf('*/', start + 2);
    return end === -1 ? src.length : end + 2;
  }
  
  function spCssFindUnnested(src, start, stops) {
    let j = start;
    while (j < src.length) {
      const ch = src[j];
      if (ch === '"' || ch === "'") { j = spCssSkipString(src, j); continue; }
      if (ch === '/' && src[j + 1] === '*') { j = spCssSkipComment(src, j); continue; }
      if (stops.indexOf(ch) !== -1) return j;
      j += 1;
    }
    return src.length;
  }
  
  function spCssMatchBlock(src, openIdx) {
    let depth = 0;
    let j = openIdx;
    while (j < src.length) {
      const ch = src[j];
      if (ch === '"' || ch === "'") { j = spCssSkipString(src, j); continue; }
      if (ch === '/' && src[j + 1] === '*') { j = spCssSkipComment(src, j); continue; }
      if (ch === '{') depth += 1;
      else if (ch === '}') { depth -= 1; if (depth === 0) return j; }
      j += 1;
    }
    return src.length;
  }
  
  function spCssScopeOneSelector(sel, scope) {
    const lead = (sel.match(/^\s*/) || [''])[0];
    const trail = (sel.match(/\s*$/) || [''])[0];
    let inner = sel.slice(lead.length, sel.length - trail.length);
    if (!inner) return sel;
  
    if (scope === SP_IFRAME_AUTHOR_SCOPE) {
      inner = spIframeMapLegacyHosts(inner);
      if (inner === ':root' || inner === 'html' || inner === 'body') {
        return lead + SP_IFRAME_AUTHOR_SCOPE + trail;
      }
      if (/^(html|body)\b/.test(inner)) {
        return lead + inner.replace(/^(html|body)/, SP_IFRAME_AUTHOR_SCOPE) + trail;
      }
      if (inner.startsWith(':host-context')) {
        return lead + inner.replace(/^:host-context\([^)]*\)/, SP_IFRAME_AUTHOR_SCOPE) + trail;
      }
      if (inner.startsWith(':host')) {
        return lead + inner.replace(/^:host\b/, SP_IFRAME_AUTHOR_SCOPE) + trail;
      }
      if (inner.startsWith('&')) {
        return lead + inner + trail;
      }
      return lead + SP_IFRAME_AUTHOR_SCOPE + ' ' + inner + trail;
    }
  
    if (inner === ':root' || inner === 'html' || inner === 'body') return lead + scope + trail;
    if (/^(html|body)\b/.test(inner)) {
      return lead + inner.replace(/^(html|body)/, scope) + trail;
    }
    return lead + scope + ' ' + inner + trail;
  }
  
  function spCssScopeSelectorList(list, scope) {
    const parts = [];
    let depth = 0;
    let last = 0;
    for (let j = 0; j < list.length; j++) {
      const ch = list[j];
      if (ch === '"' || ch === "'") { j = spCssSkipString(list, j) - 1; continue; }
      if (ch === '(' || ch === '[') depth += 1;
      else if (ch === ')' || ch === ']') depth -= 1;
      else if (ch === ',' && depth === 0) {
        parts.push(list.slice(last, j));
        last = j + 1;
      }
    }
    parts.push(list.slice(last));
    return parts.map((p) => spCssScopeOneSelector(p, scope)).join(',');
  }
  
  function spScopeAuthorCss(rawCss, scope) {
    const sc = scope || SP_IFRAME_AUTHOR_SCOPE;
    if (typeof rawCss !== 'string' || !rawCss.trim()) return '';
    const process = (src) => {
      let out = '';
      let pos = 0;
      /** Hard cap: malformed CSS must never infinite-loop the main thread. */
      const maxSteps = Math.min(2_000_000, Math.max(50_000, src.length * 32));
      let steps = 0;
      while (pos < src.length) {
        if (++steps > maxSteps) {
          out += '\n/* status-panel: scope halted (input too pathological) */\n' + src.slice(pos);
          break;
        }
        const ch = src[pos];
        if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') { out += ch; pos += 1; continue; }
        if (ch === '/' && src[pos + 1] === '*') {
          const next = spCssSkipComment(src, pos);
          out += src.slice(pos, next);
          pos = next; continue;
        }
        if (ch === '@') {
          const nameMatch = src.slice(pos + 1).match(/^[a-zA-Z\-]+/);
          const name = (nameMatch ? nameMatch[0] : '').toLowerCase();
          const term = spCssFindUnnested(src, pos, [';', '{']);
          if (term === src.length || src[term] === ';') {
            const endIdx = term === src.length ? term : term + 1;
            out += src.slice(pos, endIdx);
            pos = endIdx; continue;
          }
          const close = spCssMatchBlock(src, term);
          const header = src.slice(pos, term);
          const body = src.slice(term + 1, close);
          if (SP_PASSTHROUGH_AT_BLOCK_RULES.has(name)) {
            out += header + '{' + body + '}';
          } else if (SP_NESTED_AT_BLOCK_RULES.has(name)) {
            out += header + '{' + process(body) + '}';
          } else {
            out += header + '{' + process(body) + '}';
          }
          pos = close + 1;
          continue;
        }
        if (ch === '}') { out += ch; pos += 1; continue; }
        const brace = spCssFindUnnested(src, pos, ['{', '}']);
        if (brace >= src.length || src[brace] === '}') {
          out += src.slice(pos, brace);
          // If the next stop is `}` at the current index but this branch ran, advance —
          // avoids a rare no-progress loop on malformed input.
          if (brace < src.length && brace === pos) pos += 1;
          else pos = brace;
          continue;
        }
        const close = spCssMatchBlock(src, brace);
        const sel = src.slice(pos, brace);
        const body = src.slice(brace + 1, close);
        out += spCssScopeSelectorList(sel, sc) + '{' + body + '}';
        pos = close + 1;
      }
      return out;
    };
    return process(rawCss);
  }
  
  /** Full stylesheet for panel iframe: base + scoped author CSS + embedded template CSS. */
  function spIframeAuthorStyleText(cfgCss, embeddedCss) {
    // Strip any <style> wrapper tags — old CSS textarea may have had full HTML pasted into it
    const stripStyleTags = (s) => (s || '').replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gi, '$1').trim();
    const a = spScopeAuthorCss(stripStyleTags(cfgCss), SP_IFRAME_AUTHOR_SCOPE);
    const b = spScopeAuthorCss((embeddedCss || '').trim(), SP_IFRAME_AUTHOR_SCOPE);
    let sheet = spIframeBaseCss() + (a ? '\n' + a : '') + (b ? '\n' + b : '');
    // @import is only valid before all other rules — author CSS (web fonts from the
    // 简易 font knob or hand-pasted 高级 templates) lands after the base CSS, so hoist.
    const imports = [];
    sheet = sheet.replace(/@import\b[^;]*;/g, (m) => {
      imports.push(m);
      return '';
    });
    return imports.length ? imports.join('\n') + '\n' + sheet : sheet;
  }
  
  /** Remove legacy global author `<style>` from older builds. */
  function injectAuthorCss() {
    const doc = chatDoc();
    const el = doc.getElementById(`${SP_NS}-author-css`);
    if (el) el.remove();
  }
  

  // ─── layoutgen.js ────────────────────────────────────────────────

  // ─── 简易模式 layout generator ────────────────────────────────────────────────
  //
  // Deterministic HTML+CSS builder: field definitions + theme knobs in, complete
  // template string out (with {字段名} tokens plus the reserved {sp_badge} /
  // {sp_actions}). The output is saved to the card definition like any hand-written
  // template — the render pipeline does not treat it specially, so authors can
  // switch to 高级 mode and hand-edit the generated markup at any point.
  
  const SP_THEME_DEFAULTS = {
    accent: '#7c9cff',
    radius: 12,
    textSize: 13,
    font: '', // '' = system stack; a https:// URL = web-font stylesheet (e.g. Google Fonts css2)
    headerColor: '', // '' = follow accent
    borderColor: '', // '' = follow accent (42% mix)
    textColor: '', // '' = default light body text
    btnColor: '', // '' = derived from accent (14% fill)
    btnBorderColor: '', // '' = derived from accent (40%)
    btnTextColor: '', // '' = inherit
    buttonsCollapsed: false, // true = 重试/编辑 hidden behind a ⋯ chip
  };
  
  /** Sanitized theme knobs from a composed config (or a `{ theme }` literal). */
  function spLayoutTheme(cfg) {
    const t = cfg && cfg.theme && typeof cfg.theme === 'object' ? cfg.theme : {};
    const hex = (v) => (/^#[0-9a-fA-F]{3,8}$/.test(String(v || '').trim()) ? String(v).trim() : '');
    const radiusN = Number(t.radius);
    const sizeN = Number(t.textSize);
    const rawFont = String(t.font || '').trim();
    let font = '';
    let fontUrl = '';
    if (/^https?:\/\//i.test(rawFont)) {
      // Lands inside @import url("…") — strip anything that could escape the url()
      // or the <style> block. Google css2 URLs keep their ;/&/@ intact.
      fontUrl = rawFont.replace(/["'\\(){}<>\s]/g, '').slice(0, 300);
    } else {
      // Legacy/simple form: a font-family list. Strip declaration/style terminators.
      font = rawFont.replace(/[;{}<>\\]/g, '').slice(0, 120);
    }
    return {
      accent: hex(t.accent) || SP_THEME_DEFAULTS.accent,
      radius: Number.isFinite(radiusN) ? Math.max(0, Math.min(32, Math.round(radiusN))) : SP_THEME_DEFAULTS.radius,
      textSize: Number.isFinite(sizeN) ? Math.max(10, Math.min(20, Math.round(sizeN))) : SP_THEME_DEFAULTS.textSize,
      font,
      fontUrl,
      headerColor: hex(t.headerColor),
      borderColor: hex(t.borderColor),
      textColor: hex(t.textColor),
      btnColor: hex(t.btnColor),
      btnBorderColor: hex(t.btnBorderColor),
      btnTextColor: hex(t.btnTextColor),
      buttonsCollapsed: !!t.buttonsCollapsed,
    };
  }
  
  /** Build the iframe font-family stack from a theme (URL families first, else the plain name). */
  function spThemeFontStack(t) {
    const fontFamilies = t && t.fontUrl ? spFontFamiliesFromUrl(t.fontUrl) : (t && t.font ? [t.font] : []);
    return (
      (fontFamilies.length ? fontFamilies.join(',') + ',' : '') +
      'system-ui,-apple-system,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif'
    );
  }
  
  /** Family names from a Google-Fonts-style css2 URL (`family=Noto+Serif+SC:wght@400;700`). */
  function spFontFamiliesFromUrl(url) {
    const out = [];
    const re = /[?&]family=([^&]+)/g;
    let m;
    while ((m = re.exec(String(url || ''))) !== null) {
      let fam = m[1].split(':')[0].replace(/\+/g, ' ').trim();
      try { fam = decodeURIComponent(fam); } catch { /* keep raw */ }
      fam = fam.replace(/["'\\{}<>;]/g, '').trim();
      if (fam) out.push('"' + fam + '"');
    }
    return out;
  }
  
  /**
   * Build the full 简易 template. Number fields render a progress bar whose fill
   * width is computed in CSS from the live value (tokens inside `<style>` are
   * interpolated as plain text — see spInterpolateTemplate's plainTextPlaceholders).
   */
  function spGenerateLayoutHtml(fields, theme) {
    const t = spLayoutTheme({ theme });
    const list = (fields || []).filter((f) => f && String(f.name || '').trim());
  
    const rows = [];
    const fieldCss = [];
    list.forEach((f, i) => {
      const name = String(f.name).trim();
      const label = esc(name);
      const token = '{' + name + '}';
      if (f.type === 'number') {
        const lo = Number.isFinite(Number(f.min)) ? Number(f.min) : 0;
        const hiRaw = Number.isFinite(Number(f.max)) ? Number(f.max) : lo + 100;
        const hi = hiRaw > lo ? hiRaw : lo + 100;
        // Empty value → placeholder text lands in --spg-v, the calc turns invalid and
        // the fill collapses to 0 width — a safe "no data" look.
        fieldCss.push(
          `.spg-f${i} .spg-fill{--spg-v:${token};` +
            `width:clamp(0%, calc((var(--spg-v) - ${lo}) / ${hi - lo} * 100%), 100%);}`,
        );
        rows.push(
          `  <div class="spg-row spg-row-num spg-f${i}">` +
            `<span class="spg-label">${label}</span>` +
            `<span class="spg-bar"><span class="spg-fill"></span></span>` +
            `<span class="spg-value spg-value-num">${token}</span>` +
            `</div>`,
        );
      } else if (f.type === 'enum') {
        rows.push(
          `  <div class="spg-row spg-f${i}">` +
            `<span class="spg-label">${label}</span>` +
            `<span class="spg-value"><span class="spg-pill">${token}</span></span>` +
            `</div>`,
        );
      } else {
        rows.push(
          `  <div class="spg-row spg-f${i}">` +
            `<span class="spg-label">${label}</span>` +
            `<span class="spg-value">${token}</span>` +
            `</div>`,
        );
      }
    });
  
    // v3: the generator emits ONLY structure-specific CSS — the web-font @import (hoisted
    // by spBuildIframeSrcdoc) and per-field progress-bar fill widths. All chrome styling
    // (card/head/title/rows/bars/pills/buttons/badge) lives in SP_IFRAME_GLOBAL_CSS, themed
    // via CSS variables set per-card in spBuildIframeSrcdoc. This is the S6 global-CSS
    // invariant: generated templates carry markup, not hardcoded colors.
    const css = [
      ...(t.fontUrl ? [`@import url("${t.fontUrl}");`] : []),
    ].concat(fieldCss);
  
    return (
      (css.length ? '<style>\n' + css.join('\n') + '\n</style>\n' : '') +
      '<section class="spg-card">\n' +
      '  <header class="spg-head"><span class="spg-title">状态</span>{sp_badge}</header>\n' +
      '  <div class="spg-rows">\n' +
      rows.join('\n') + '\n' +
      '  </div>\n' +
      '  {sp_actions}\n' +
      '</section>'
    );
  }
  

  // ─── render.js ───────────────────────────────────────────────────

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
  
    const { start: tagS, end: tagE } = spTagPair(effectiveConfig());
  
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
   * `{name}` = live stored value. Empty/missing → a muted dash placeholder (S5): the
   * panel never shows a field's 示例值 as if it were real data. `{{name}}` default
   * tokens were removed in v3 (S4/S10) — they are no longer substituted.
   */
  function spInterpolateTemplate(template, values, fields, opts) {
    const preEscapedLive = opts && opts.preEscapedLiveValues === true;
    /** Inside `<style>` bodies: never emit HTML placeholder spans (breaks CSS / scoping). */
    const plainTextPlaceholders = opts && opts.plainTextPlaceholders === true;
    let html = template || '';
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
  

  // ─── generate.js ─────────────────────────────────────────────────

  // ─── Manual 重试 generation (JSON schema) ──────────────────────────────────
  //
  // The ONLY generateRaw call site in the engine, reachable ONLY from the 重试
  // action (bridge → spRetry → here). There is no auto/fallback generation: a reply
  // without a status block leaves the panel empty (S1/S5). The prompt is deliberately
  // minimal (S3): status instructions + optional previous values + the target message
  // text (status block stripped) + the JSON-schema constraint. No preset merge, no
  // chat-history builtin, no history snapshots — those were scrapped in v3.
  
  // Global serializer: ensures only one generateRaw call runs at a time (avoids rate-limit bursts).
  let _spGenChain = Promise.resolve();
  function spResetGenChain() { _spGenChain = Promise.resolve(); }
  
  /** Remove the status-block span (markers + inner) from a message so the model sees clean prose. */
  function spStripStatusBlockFromText(text, cfg) {
    const s = String(text || '');
    const { start, end } = spTagPair(cfg);
    const a = s.indexOf(start);
    const b = s.lastIndexOf(end);
    if (a === -1 || b === -1 || b <= a) return s.trim();
    return (s.slice(0, a) + s.slice(b + end.length)).trim();
  }
  
  /**
   * One compact "previous known status" line so numeric stats evolve from their last
   * value instead of being re-guessed from prose. Walks back from the message before
   * the target to the nearest assistant message that has stored values. Returns a
   * prompt object or null. Gated by cfg.retryIncludePrev (S3 toggle).
   */
  function spBuildPrevStatusInject(cfg, currentMessageId) {
    if (!cfg || !cfg.retryIncludePrev) return null;
    const startId = Number.isFinite(Number(currentMessageId)) ? Number(currentMessageId) - 1 : -1;
    for (let id = startId; id >= 0; id--) {
      const row = spGetMessageRow(id);
      if (!row || row.role !== 'assistant') continue;
      const st = spGetMessageStatus(row);
      const values = st && st.values && typeof st.values === 'object' ? st.values : null;
      if (!values || Object.keys(values).length === 0) continue;
      return {
        role: 'system',
        content: '上一条已知状态（用于保持数值、日期等的连续性；仅供参考，请根据最新剧情更新）：\n' +
          JSON.stringify(values),
      };
    }
    return null;
  }
  
  /**
   * Assemble the ordered_prompts for the manual retry generation (S3).
   *   1. instructions (role = engine defaultPromptRole)
   *   2. previous known status (optional)
   *   3. the target message's prose, status block stripped (assistant turn)
   *   4. the JSON-schema constraint (user turn)
   */
  function buildStatusGenerationPrompts(cfg, messageId) {
    const role = cfg.defaultPromptRole === 'user' ? 'user'
      : cfg.defaultPromptRole === 'assistant' ? 'assistant' : 'system';
    const ordered = [];
  
    const instr = spBuildFullPromptContent(cfg, { forSecondary: true });
    if (instr.trim()) ordered.push({ role, content: instr });
  
    const prev = spBuildPrevStatusInject(cfg, messageId);
    if (prev) ordered.push(prev);
  
    const row = spGetMessageRow(messageId);
    const cleaned = row ? spStripStatusBlockFromText(row.message || '', cfg) : '';
    if (cleaned) ordered.push({ role: 'assistant', content: cleaned });
  
    const schemaJson = JSON.stringify(statusFieldsToJsonSchema(cfg.fields));
    ordered.push({
      role: 'user',
      content: '请仅输出一个 JSON 对象（不要 markdown 代码块、不要任何其他文字），并严格满足以下 JSON Schema：\n' + schemaJson,
    });
  
    return ordered;
  }
  
  function spExtractGenerateText(result) {
    if (result == null) return '';
    if (typeof result === 'string') return result;
    if (typeof result === 'object' && typeof result.content === 'string') return result.content;
    try {
      return JSON.stringify(result);
    } catch {
      return String(result);
    }
  }
  
  async function runStatusGeneration(messageId) {
    const TH = getTH();
    if (!TH || typeof TH.generateRaw !== 'function') {
      spToast('TavernHelper.generateRaw 不可用', '状态面板');
      return null;
    }
  
    const cfg = effectiveConfig();
  
    // S5: retry with no fields defined is an error, not a request. There is nothing for
    // the model to fill and no schema to constrain the reply.
    if (!(cfg.fields || []).length) {
      spToast('尚无字段 — 请先在「字段」页定义要追踪的状态', '状态面板');
      return null;
    }
  
    const ordered_prompts = buildStatusGenerationPrompts(cfg, messageId);
  
    const json_schema = {
      name: 'status_panel',
      value: statusFieldsToJsonSchema(cfg.fields),
      strict: true,
    };
  
    let custom_api = undefined;
    if (cfg.apiMode !== 'main') {
      custom_api = {
        apiurl: cfg.apiOpenaiUrl || '',
        key: cfg.apiOpenaiKey || '',
        model: cfg.apiOpenaiModel || '',
        source: 'openai',
      };
    }
  
    // Serialize concurrent generateRaw calls to avoid rate-limit bursts.
    let _unlock;
    const _prevChain = _spGenChain;
    _spGenChain = new Promise((res) => { _unlock = res; });
  
    try {
      await _prevChain;
      spBroadcastState(messageId, true);
      try {
        const raw = await TH.generateRaw({
          custom_api,
          ordered_prompts,
          max_chat_history: 0,
          json_schema,
          should_silence: true,
        });
  
        const text = spExtractGenerateText(raw).trim();
        let parsed;
        try {
          parsed = JSON.parse(text);
        } catch {
          const brace = text.indexOf('{');
          const close = text.lastIndexOf('}');
          if (brace !== -1 && close > brace) parsed = JSON.parse(text.slice(brace, close + 1));
          else throw new Error('无法从模型输出中解析 JSON');
        }
  
        // Validate all expected field keys are present — rejects thinking/prose responses.
        const expectedKeys = (cfg.fields || []).map((f) => String(f.name || '').trim()).filter(Boolean);
        if (expectedKeys.length > 0) {
          const missing = expectedKeys.filter((k) => !(k in parsed));
          if (missing.length > 0) throw new Error(`状态 JSON 缺少预期字段：${missing.join(', ')}`);
        }
  
        const values = spNormalizeValuesFromParsed(parsed, cfg.fields);
        await spMergeChatMessageData(messageId, (prevData) => {
          // If MESSAGE_RECEIVED stored marker data while we were generating, don't overwrite it.
          const existing = prevData && prevData[SP_CHAT_STATUS_KEY];
          if (existing && existing.source === 'markers') return prevData;
          return {
            ...prevData,
            [SP_CHAT_STATUS_KEY]: {
              values,
              source: 'auto',
            },
            [SP_CHAT_META_KEY]: {
              ...(prevData && prevData[SP_CHAT_META_KEY] && typeof prevData[SP_CHAT_META_KEY] === 'object' ? prevData[SP_CHAT_META_KEY] : {}),
              updatedAt: Date.now(),
            },
          };
        });
        return values;
      } catch (e) {
        log('runStatusGeneration failed', e);
        const reason = String(e && e.message ? e.message : e);
        spToast(reason, '状态面板');
        // Record the failure as an explicit error state. Prior values (if any) are kept so a
        // failed 重试 doesn't wipe a previously good panel; 重试 stays live.
        await spMergeChatMessageData(messageId, (prevData) => {
          const prevSt = prevData && prevData[SP_CHAT_STATUS_KEY];
          const prevValues = prevSt && typeof prevSt.values === 'object' ? prevSt.values : {};
          return {
            ...prevData,
            [SP_CHAT_STATUS_KEY]: {
              values: prevValues,
              source: 'error',
              error: reason,
            },
            [SP_CHAT_META_KEY]: {
              ...(prevData && prevData[SP_CHAT_META_KEY] && typeof prevData[SP_CHAT_META_KEY] === 'object' ? prevData[SP_CHAT_META_KEY] : {}),
              updatedAt: Date.now(),
            },
          };
        });
        return null;
      } finally {
        spBroadcastState(messageId, false);
        _unlock();
      }
    } catch (e) {
      _unlock();
      throw e;
    }
  }
  

  // ─── panel.js ────────────────────────────────────────────────────

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
  

  // ─── toolbar.js ──────────────────────────────────────────────────

  // ─── TavernHelper script toolbar buttons ─────────────────────────────────────
  
  const SP_TH_BUTTON_RELOAD = 'SP 重载';
  const SP_TH_BUTTON_PANEL = 'SP 面板';
  /** Opens clear-panel modal in the chat. */
  const SP_TH_BUTTON_CLEAR = 'SP 清除';
  
  function spBindScriptToolbarButtons() {
    const TH = getTH();
    const bind = TH && TH._bind;
    if (!bind) return;
  
    const bindButton = (name, listener) => {
      if (typeof bind._eventOnButton === 'function') {
        bind._eventOnButton.call(window, name, listener);
        return;
      }
      if (typeof bind._eventOn === 'function' && typeof bind._getButtonEvent === 'function') {
        bind._eventOn.call(window, bind._getButtonEvent.call(window, name), listener);
      }
    };
  
    bindButton(SP_TH_BUTTON_RELOAD, () => {
      spToast('正在重新加载脚本…', '状态面板');
      if (typeof bind._reloadIframe === 'function') {
        bind._reloadIframe.call(window);
        return;
      }
      try {
        window.parent.location.reload();
      } catch {
        window.location.reload();
      }
    });
  
    bindButton(SP_TH_BUTTON_PANEL, () => {
      if (typeof window.__spOpenPanel === 'function') window.__spOpenPanel();
    });
  
    bindButton(SP_TH_BUTTON_CLEAR, () => {
      if (typeof spShowClearModal === 'function') spShowClearModal();
    });
  }
  

  // ─── index.js ────────────────────────────────────────────────────

  // ─── Init: styles, panel wiring, TavernHelper events ─────────────────────────
  
  function initStatusPanel() {
    spDisposePreviousRuntime();
  
    injectStylesOnce();
    injectAuthorCss();
  
    spInitBridge();
  
    spBindScriptToolbarButtons();
  
    try {
      refreshAllAssistantPanels();
    } catch (e) {
      log('initial refreshAllAssistantPanels failed', e);
    }
  
    const TH = getTH();
    const ev = TH && TH.tavern_events;
  
    if (ev && typeof spBindEvent === 'function') {
      spBindEvent(ev.CHARACTER_MESSAGE_RENDERED, (messageId) => {
        if (!spPanelEnabled()) return;
        void onCharacterMessageRendered(messageId);
      });
  
      /**
       * Edit confirm (`messageEditDone`): ST emits this, then runs `saveChatConditional`.
       * Defer past save + two animation frames so layout from ST's `messageFormatting` settles
       * before we touch DOM / TH.setChatMessages (avoids races and layout thrash on huge `.mes_text`).
       */
      spBindEvent(ev.MESSAGE_UPDATED, (messageId) => {
        if (!spPanelEnabled()) return;
        const id = messageId;
        setTimeout(() => {
          // Top-window frames via spDeferFrames — this script's own rAF never fires in
          // Firefox (TH hides its iframe with display:none).
          spDeferFrames(2, () => {
            void onCharacterMessageRendered(id, { afterManualEdit: true }).then(() => {
              // Post-save: hide marker transport + mount once (defer beyond ST's edit-save stack).
              spDeferFrames(2, () => {
                try {
                  if (typeof spStripMarkersFromDisplayedMessage === 'function') {
                    spStripMarkersFromDisplayedMessage(id);
                  }
                  renderPanelForMessage(id);
                } catch (e) {
                  log('post-edit mount failed', e);
                }
              });
            });
          });
        }, 0);
      });
  
      spBindEvent(ev.MESSAGE_RECEIVED, (messageId) => {
        if (!spPanelEnabled()) return;
        void onMessageReceivedCapture(messageId);
      });
  
      spBindEvent(ev.MESSAGE_SWIPED, (messageId) => {
        if (!spPanelEnabled()) return;
        void (async () => {
          // Re-parse markers from the newly displayed swipe (markers-only, no generateRaw).
          await spSyncMarkersOnlyForMessage(messageId);
          // Strip marker transport text (and insert debug block if parse failed).
          spStripMarkersFromDisplayedMessage(messageId);
          renderPanelForMessage(messageId);
          const cfg = effectiveConfig();
          if (cfg.renderMode === 'last_only') {
            const last = spLastAssistantMesId();
            if (last !== null) spStripPanelsExcept(last);
          }
        })();
      });
  
      let spChatChangedRefreshTimer = null;
      const spDebouncedFullRefresh = (label) => {
        if (spChatChangedRefreshTimer) clearTimeout(spChatChangedRefreshTimer);
        spChatChangedRefreshTimer = setTimeout(() => {
          spChatChangedRefreshTimer = null;
          try {
            refreshAllAssistantPanels();
          } catch (e) {
            log(label + ' refresh failed', e);
          }
        }, 100);
      };
      spBindEvent(ev.CHAT_CHANGED, () => spDebouncedFullRefresh('CHAT_CHANGED'));
  
      // Deleting the last message must resurface the previous message's panel (last_only mode).
      spBindEvent(ev.MESSAGE_DELETED, () => {
        if (!spPanelEnabled()) return;
        spDebouncedFullRefresh('MESSAGE_DELETED');
      });
  
    } else {
      log('TavernHelper events unavailable — MutationObserver fallback');
      initFallbackChatObserver();
    }
  
    try {
      window[SP_NS] = Object.assign({}, window[SP_NS], {
        version: '0.3.0-dev',
        openPanel,
        refresh: refreshAllAssistantPanels,
        dispose: spDisposeRuntime,
        /** Diagnostic snapshot of the engine's view of the current chat (DevTools helper). */
        debugState: () => ({
          state: spPanelState(),
          charKey: spCurrentCharKey(),
          ctxCharacterId: (() => { try { const c = spGetSTContext(); return c ? c.characterId : null; } catch { return '(ctx error)'; } })(),
          fields: (effectiveConfig().fields || []).length,
        }),
        /** Emergency: remove panel mounts only (keeps settings). DevTools: `window['sp-status-panel'].detachPanels()` */
        detachPanels: () => {
          try {
            chatDoc().querySelectorAll('.sp-block-root').forEach((el) => el.remove());
          } catch (e) {
            log('detachPanels failed', e);
          }
        },
      });
    } catch {
      /* ignore */
    }
  
    log('Status Panel initialized');
    // Stay quiet for characters without a panel — the engine is invisible until opted in.
    if (spPanelEnabled()) {
      spToast('状态栏已就绪 — 打开 TavernHelper 脚本工具栏，点击「SP 面板」按钮进入设置', '状态面板');
    }
  }
  
  function initFallbackChatObserver() {
    const doc = chatDoc();
    const root = doc.querySelector('#chat') || doc.body;
    let t = null;
    const obs = new MutationObserver(() => {
      if (spMutationObserverSuspended()) return;
      clearTimeout(t);
      t = setTimeout(() => {
        if (spMutationObserverSuspended()) return;
        try {
          refreshAllAssistantPanels();
        } catch (e) {
          log('fallback observer', e);
        }
      }, 50);
    });
    obs.observe(root, { childList: true, subtree: true });
    spAddDisposer(() => {
      clearTimeout(t);
      obs.disconnect();
    });
  }
  
  try {
    initStatusPanel();
  } catch (e) {
    console.error('[status-panel] init failed', e);
    spToast(String(e && e.message ? e.message : e), 'Status Panel FAILED');
  }
  
})();

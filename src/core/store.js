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

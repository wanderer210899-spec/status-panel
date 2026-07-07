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

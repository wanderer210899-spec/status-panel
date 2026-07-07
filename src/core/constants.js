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

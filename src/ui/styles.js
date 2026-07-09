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
      // Theme: inherits the active SillyTavern theme (--SmartTheme* vars), falling back to the
      // card's panel --sp-* vars, then to a literal dark surface. (S6 amended 2026-07-09 — the
      // editor used to match the card panel; user chose ST-theme consistency with the settings window.)
      // NOTE: height is 100vh, NOT inset:0/bottom:0. ST puts a transform+perspective on <html>,
      // which makes <html> the containing block for our position:fixed overlay; that box is
      // height-collapsed, so inset:0 gave the overlay ~0 height and the modal centred off-screen.
      // vh is viewport-relative regardless of containing block. Do not revert to inset:0.
      '.sp-edit-modal{position:fixed;top:0;left:0;right:0;height:100vh;background:rgba(0,0,0,.65);z-index:100001;display:flex;align-items:center;justify-content:center;overflow-y:auto;padding:16px;box-sizing:border-box;}\n' +
      '.sp-edit-modal .sp-edit-box{background:var(--SmartThemeBlurTintColor,#1b1d27);border:1px solid var(--SmartThemeBorderColor,var(--sp-border-color,rgba(255,255,255,.15)));border-radius:var(--sp-radius,14px);padding:20px 22px;' +
        'max-width:520px;width:92%;max-height:88vh;display:flex;flex-direction:column;color:var(--SmartThemeBodyColor,var(--sp-text-color,rgba(255,255,255,.92)));' +
        'font:13px/1.45 var(--sp-font,system-ui,Segoe UI,Roboto,sans-serif);box-shadow:0 8px 32px var(--SmartThemeShadowColor,rgba(0,0,0,.5));}\n' +
      '.sp-edit-modal .sp-em-title{margin:0 0 4px;font-size:15px;font-weight:650;color:var(--SmartThemeQuoteColor,var(--sp-title-color,var(--sp-accent,inherit)));}\n' +
      '.sp-edit-modal .sp-em-sub{margin:0 0 14px;font-size:11px;opacity:.7;}\n' +
      '.sp-edit-modal .sp-em-fields{flex:1 1 auto;min-height:0;overflow-y:auto;display:flex;flex-direction:column;gap:12px;padding-right:4px;}\n' +
      '.sp-edit-modal .sp-em-row{display:flex;flex-direction:column;gap:4px;}\n' +
      '.sp-edit-modal .sp-em-label{font:600 11px/1.1 ui-monospace,monospace;text-transform:uppercase;letter-spacing:.06em;opacity:.75;}\n' +
      '.sp-edit-modal .sp-em-input{box-sizing:border-box;width:100%;padding:6px 8px;border-radius:8px;border:1px solid var(--SmartThemeBorderColor,var(--sp-border-color,rgba(255,255,255,.18)));' +
        'background:var(--black30a,rgba(0,0,0,.32));color:var(--SmartThemeBodyColor,var(--sp-text-color,rgba(255,255,255,.95)));font:12px/1.4 ui-monospace,monospace;}\n' +
      '.sp-edit-modal .sp-em-textarea{min-height:54px;resize:vertical;}\n' +
      '.sp-edit-modal .sp-em-input:focus{outline:1px solid var(--SmartThemeQuoteColor,var(--sp-accent,rgba(160,140,255,.6)));}\n' +
      '.sp-edit-modal .sp-em-hint{font-size:10px;opacity:.55;}\n' +
      '.sp-edit-modal .sp-em-actions{display:flex;align-items:center;gap:8px;margin-top:14px;padding-top:12px;border-top:1px solid var(--SmartThemeBorderColor,rgba(255,255,255,.08));}\n' +
      '.sp-edit-modal .sp-em-btn{all:unset;cursor:pointer;box-sizing:border-box;padding:7px 14px;border-radius:9px;font-size:12px;' +
        'border:1px solid var(--SmartThemeBorderColor,var(--sp-btn-border-color,rgba(255,255,255,.18)));background:var(--sp-btn-color,rgba(0,0,0,.3));color:var(--sp-btn-text-color,inherit);}\n' +
      '.sp-edit-modal .sp-em-btn:hover{filter:brightness(1.15);}\n' +
      '.sp-edit-modal .sp-em-btn-save{border-color:var(--SmartThemeQuoteColor,var(--sp-accent,rgba(160,140,255,.45)));background:color-mix(in srgb, var(--SmartThemeQuoteColor,var(--sp-accent,#6e5ac8)) 32%, transparent);font-weight:600;}\n' +
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
        border: 1px solid var(--SmartThemeBorderColor, rgba(255,255,255,0.14));
        /* B3: guarantee a near-opaque surface (≥0.8) even when the theme's tint var is
           translucent, by compositing the tint over itself several times. When the ST var
           is absent the gradient layers resolve to transparent, so the shipped fallback is
           exactly the original single opaque-ish surface — look unchanged. */
        background-color: var(--SmartThemeBlurTintColor, rgba(22,22,28,0.96));
        background-image:
          linear-gradient(var(--SmartThemeBlurTintColor, transparent), var(--SmartThemeBlurTintColor, transparent)),
          linear-gradient(var(--SmartThemeBlurTintColor, transparent), var(--SmartThemeBlurTintColor, transparent)),
          linear-gradient(var(--SmartThemeBlurTintColor, transparent), var(--SmartThemeBlurTintColor, transparent)),
          linear-gradient(var(--SmartThemeBlurTintColor, transparent), var(--SmartThemeBlurTintColor, transparent));
        box-shadow: 0 12px 40px var(--SmartThemeShadowColor, rgba(0,0,0,0.45));
        overflow: hidden;
        font: 13px/1.35 var(--mainFontFamily, system-ui, Segoe UI, Roboto, sans-serif);
        color: var(--SmartThemeBodyColor, rgba(255,255,255,0.92));
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
        border-bottom: 1px solid var(--SmartThemeBorderColor, rgba(255,255,255,0.08));
        background: var(--black30a, rgba(0,0,0,0.25));
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
      /* F2: unsaved-changes cue + F1: 清除更改 button, top-right of the header. */
      #${SP_PANEL_ID} .sp-unsaved-cue {
        font-size: 11px; font-weight: 600; color: #f0c674; opacity: 0.95; white-space: nowrap;
      }
      #${SP_PANEL_ID} .sp-panel-clear {
        all: unset; cursor: pointer; padding: 4px 10px; border-radius: 8px; font-size: 11px; opacity: 0.85;
        border: 1px solid var(--SmartThemeBorderColor, rgba(255,255,255,0.18));
        background: var(--black30a, rgba(0,0,0,0.25));
      }
      #${SP_PANEL_ID} .sp-panel-clear:hover { opacity: 1; background: rgba(255,255,255,0.08); }
      #${SP_PANEL_ID} .sp-tabs {
        display: flex;
        gap: 4px;
        padding: 8px 8px 0;
        border-bottom: 1px solid var(--SmartThemeBorderColor, rgba(255,255,255,0.08));
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
        border: 1px solid var(--SmartThemeBorderColor, rgba(255,255,255,0.12));
        background: var(--black30a, rgba(0,0,0,0.35));
        color: inherit;
        font: 12px/1.35 ui-monospace, monospace;
      }
      #${SP_PANEL_ID} textarea { min-height: 72px; resize: vertical; }
      #${SP_PANEL_ID} #sp-def-prompt { min-height: 140px; }
#${SP_PANEL_ID} .sp-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; min-width: 0; }
      /* B2/B4: keep an inline field group (label text + its control, or a check/radio +
         its caption) on one aligned baseline. Selects/number inputs in a row must size to
         content, not stretch to the global 100% width that would break the row. */
      #${SP_PANEL_ID} .sp-row label { display: inline-flex; align-items: center; gap: 6px; }
      #${SP_PANEL_ID} .sp-row label > select,
      #${SP_PANEL_ID} .sp-row label > input[type="number"] { width: auto; }
      /* B4: ST's global input styling otherwise leaks onto our check/radio boxes and
         pushes them off their labels — reset size/margin so they sit beside the caption. */
      #${SP_PANEL_ID} input[type="checkbox"], #${SP_PANEL_ID} input[type="radio"] {
        width: auto; margin: 0; flex: 0 0 auto; vertical-align: middle;
        accent-color: var(--SmartThemeQuoteColor, #7c9cff);
      }
      #${SP_PANEL_ID} .sp-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px; }
      #${SP_PANEL_ID} button.sp-btn {
        all: unset;
        cursor: pointer;
        padding: 6px 12px;
        border-radius: 8px;
        border: 1px solid var(--SmartThemeBorderColor, rgba(255,255,255,0.14));
        background: rgba(255,255,255,0.06);
        font-size: 12px;
      }
      #${SP_PANEL_ID} button.sp-btn:hover { background: rgba(255,255,255,0.1); }
      #${SP_PANEL_ID} button.sp-btn-sm { padding: 3px 8px; font-size: 11px; opacity: 0.8; }
      #${SP_PANEL_ID} .sp-import-row { display: flex; gap: 6px; margin-bottom: 4px; }
      #${SP_PANEL_ID} .sp-field-list { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
      #${SP_PANEL_ID} .sp-field-card {
        border: 1px solid var(--SmartThemeBorderColor, rgba(255,255,255,0.1));
        border-radius: 10px;
        padding: 10px;
        min-width: 0;
        background: var(--black30a, rgba(0,0,0,0.18));
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
      #${SP_PANEL_ID} .sp-field-range { margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--SmartThemeBorderColor, rgba(255,255,255,0.06)); }
      #${SP_PANEL_ID} .sp-field-range .sp-label { margin-bottom: 4px; }
      #${SP_PANEL_ID} .sp-field-range-inputs {
        display: grid;
        grid-template-columns: 1fr auto 1fr;
        gap: 6px;
        align-items: center;
        min-width: 0;
      }
      #${SP_PANEL_ID} .sp-field-range-dash { opacity: 0.5; text-align: center; font-size: 12px; }
      #${SP_PANEL_ID} .sp-preview-wrap {
        border: 1px solid var(--SmartThemeBorderColor, rgba(255,255,255,0.12));
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
        background: var(--black30a, rgba(0,0,0,0.28));
        border: 1px solid var(--SmartThemeBorderColor, rgba(255,255,255,0.08));
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
        border: 1px solid var(--SmartThemeBorderColor, rgba(255,255,255,0.18));
        background: var(--black30a, rgba(0,0,0,0.3));
        cursor: pointer;
        vertical-align: middle;
      }
      /* B1: hex companion for every colour well — the native picker degrades to a few
         swatches on mobile, so authors can type/paste any colour here instead. */
      #${SP_PANEL_ID} input[type="text"].sp-color-hex {
        width: 5.5rem;
        flex: 0 0 auto;
        padding: 4px 6px;
        font: 11px/1.3 ui-monospace, monospace;
        text-transform: lowercase;
      }
      #${SP_PANEL_ID} details.sp-adv {
        border: 1px solid var(--SmartThemeBorderColor, rgba(255,255,255,0.1));
        border-radius: 8px;
        padding: 8px 10px;
        background: var(--black30a, rgba(0,0,0,0.18));
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
        border: 1px solid var(--SmartThemeBorderColor, rgba(255,255,255,0.08));
        background: var(--black30a, rgba(0,0,0,0.18));
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
    'color:var(--sp-text-color,rgba(255,255,255,.92));background:rgba(12,14,20,.88);' +
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

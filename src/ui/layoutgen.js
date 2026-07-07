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

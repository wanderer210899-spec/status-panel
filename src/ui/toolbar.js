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

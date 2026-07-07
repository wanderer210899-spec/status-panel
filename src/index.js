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

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
function spStripStatusBlockFromText(text) {
  const s = String(text || '');
  const { start, end } = spTagPair();
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
  const cleaned = row ? spStripStatusBlockFromText(row.message || '') : '';
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

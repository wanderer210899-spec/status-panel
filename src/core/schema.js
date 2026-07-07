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

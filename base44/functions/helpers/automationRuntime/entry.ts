/**
 * SAFE AUTOMATION RUNTIME WRAPPER
 * ================================
 * 
 * Provides hardened helpers for automation functions.
 * DO NOT MODIFY without owner approval — used by all automations.
 * 
 * Features:
 * - Payload parsing with size limits
 * - Safe record ID extraction (no heavy scanning)
 * - DB query timeouts (2000ms hard limit)
 * - Structured error logging
 * - Feature flags for risky operations
 */

// ─────────────────────────────────────────────────────
// FEATURE FLAGS (default: SAFE/OFF)
// ─────────────────────────────────────────────────────
const FLAGS = {
  ENABLE_DEEP_SCAN_RESOLUTION: false,     // disabled by default
  ENABLE_LATEST_ALERT_FALLBACK: false,    // disabled by default
  ENABLE_AUTOPATCH: false                 // disabled by default
};

// ─────────────────────────────────────────────────────
// PAYLOAD PARSING
// ─────────────────────────────────────────────────────
export async function parseAutomationPayload(req) {
  let payload = {};
  let rawText = '';
  
  try {
    rawText = await req.text();
    if (rawText) payload = JSON.parse(rawText);
  } catch (e) {
    payload = {};
  }
  
  return {
    payload,
    rawText,
    payloadKeys: Object.keys(payload),
    payloadSize: rawText.length,
    hasTooLargeFlag: payload.payload_too_large === true
  };
}

// ─────────────────────────────────────────────────────
// ID EXTRACTION (MINIMAL, SAFE)
// ─────────────────────────────────────────────────────
function looksLikeId(v) {
  return typeof v === 'string' && /^[a-f0-9]{24}$/i.test(v);
}

function getByPath(obj, path) {
  if (!obj || !path) return undefined;
  const parts = path.split('.');
  let cur = obj;
  for (const p of parts) {
    if (!cur) return undefined;
    cur = cur[p];
  }
  return cur;
}

export function extractSelectedRecordId(payload) {
  // Primary: automation.record_id (safest, from UI)
  const primary = getByPath(payload, 'automation.record_id');
  if (primary && looksLikeId(primary)) {
    return { id: primary, source: 'automation.record_id' };
  }
  
  // Secondary: data.id or data.record.id
  const secondary1 = getByPath(payload, 'data.id');
  if (secondary1 && looksLikeId(secondary1)) {
    return { id: secondary1, source: 'data.id' };
  }
  
  const secondary2 = getByPath(payload, 'data.record.id');
  if (secondary2 && looksLikeId(secondary2)) {
    return { id: secondary2, source: 'data.record.id' };
  }
  
  // Tertiary: event.data.id (less common)
  const tertiary = getByPath(payload, 'event.data.id');
  if (tertiary && looksLikeId(tertiary)) {
    return { id: tertiary, source: 'event.data.id' };
  }
  
  return { id: null, source: null };
}

export function extractTenantId(payload) {
  // Try primary paths
  const paths = [
    'data.tenant_id',
    'automation.tenant_id',
    'event.tenant_id',
    'tenant_id'
  ];
  
  for (const p of paths) {
    const v = getByPath(payload, p);
    if (v && looksLikeId(v)) return v;
  }
  
  return null;
}

// ─────────────────────────────────────────────────────
// TIMEOUT WRAPPER
// ─────────────────────────────────────────────────────
export function withTimeout(promise, ms = 2000) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`timeout_${ms}ms`)), ms)
    )
  ]);
}

// ─────────────────────────────────────────────────────
// SAFE ENTITY FILTER (with timeout)
// ─────────────────────────────────────────────────────
export async function safeFilter(entity, query, limit = 1) {
  try {
    const result = await withTimeout(
      entity.filter(query, '-updated_date', limit),
      2000
    );
    return Array.isArray(result) ? result : [];
  } catch (e) {
    // Log structured error but don't throw
    console.error(`[safeFilter] ${entity.name} error:`, e.message);
    return [];
  }
}

// ─────────────────────────────────────────────────────
// STRUCTURED LOGGING (ready for AuditLog)
// ─────────────────────────────────────────────────────
export function structuredLog(eventName, fields) {
  const schema = {
    automation: fields.automation || null,
    function: fields.function || null,
    resolved_record_id: fields.resolved_record_id || null,
    resolved_tenant_id: fields.resolved_tenant_id || null,
    elapsed_ms: fields.elapsed_ms || 0,
    status: fields.status || 'unknown',  // success, failed, timeout
    error_code: fields.error_code || null,
    source: fields.source || null
  };
  
  console.log(`[${eventName}]`, JSON.stringify(schema));
  return schema;
}

// ─────────────────────────────────────────────────────
// FEATURE FLAG GUARD
// ─────────────────────────────────────────────────────
export function isFlagEnabled(flagName) {
  return FLAGS[flagName] === true;
}
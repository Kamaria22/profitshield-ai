const WINDOW_MS = 60 * 1000;
const ipCounters = new Map<string, { count: number; resetAt: number }>();
const replayCache = new Map<string, number>();

function nowMs() {
  return Date.now();
}

function cleanupExpired(map: Map<string, any>, ttlMs = WINDOW_MS) {
  const now = nowMs();
  for (const [k, v] of map.entries()) {
    const t = typeof v === 'number' ? v : v?.resetAt;
    if (!t || t <= now - ttlMs) map.delete(k);
  }
}

export function getClientKey(req: Request) {
  const fwd = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || '';
  const first = fwd.split(',').map((s) => s.trim()).filter(Boolean)[0];
  return first || 'unknown';
}

export function enforcePayloadLimit(req: Request, maxBytes: number) {
  const len = Number(req.headers.get('content-length') || '0');
  if (!Number.isFinite(len) || len <= 0) return { ok: true };
  if (len > maxBytes) return { ok: false, reason: 'payload_too_large', status: 413 };
  return { ok: true };
}

export function enforceRateLimit(key: string, maxPerWindow: number, windowMs = WINDOW_MS) {
  cleanupExpired(ipCounters, windowMs);
  const now = nowMs();
  const row = ipCounters.get(key);
  if (!row || row.resetAt <= now) {
    ipCounters.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: maxPerWindow - 1 };
  }
  if (row.count >= maxPerWindow) {
    return { ok: false, reason: 'rate_limited', status: 429, retry_after_ms: Math.max(0, row.resetAt - now) };
  }
  row.count += 1;
  ipCounters.set(key, row);
  return { ok: true, remaining: Math.max(0, maxPerWindow - row.count) };
}

export function checkReplay(cacheKey: string, ttlMs = 10 * 60 * 1000) {
  cleanupExpired(replayCache, ttlMs);
  const now = nowMs();
  const seenAt = replayCache.get(cacheKey);
  if (seenAt && now - seenAt <= ttlMs) {
    return { replay: true };
  }
  replayCache.set(cacheKey, now);
  return { replay: false };
}

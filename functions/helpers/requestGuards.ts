const WINDOW_MS = 60 * 1000;
const ipCounters = new Map<string, { count: number; resetAt: number }>();
const replayCache = new Map<string, number>();
const probeCounters = new Map<string, { count: number; resetAt: number }>();

const SCANNER_UA_PATTERNS = [
  /sqlmap/i,
  /nikto/i,
  /acunetix/i,
  /masscan/i,
  /zgrab/i,
  /nmap/i,
  /nessus/i,
  /wpscan/i,
  /dirbuster/i,
];

const PROBE_PATH_PATTERNS = [
  /\/wp-admin/i,
  /\/wp-login\.php/i,
  /\/\.env/i,
  /\/phpmyadmin/i,
  /\/cgi-bin\//i,
  /\/\.git\//i,
  /\/boaform\//i,
  /\/etc\/passwd/i,
  /union\s+select/i,
  /<script/i,
  /%3cscript/i,
];

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

export function detectAutomatedProbe(req: Request, endpointTag = 'endpoint') {
  cleanupExpired(probeCounters, 10 * 60 * 1000);

  const ip = getClientKey(req);
  const ua = req.headers.get('user-agent') || '';
  const url = new URL(req.url);
  const signal = `${url.pathname}${url.search}`;

  const uaHit = SCANNER_UA_PATTERNS.find((re) => re.test(ua));
  const pathHit = PROBE_PATH_PATTERNS.find((re) => re.test(signal));

  if (!uaHit && !pathHit) {
    return { ok: true };
  }

  const key = `${endpointTag}:${ip}`;
  const now = nowMs();
  const row = probeCounters.get(key);
  if (!row || row.resetAt <= now) {
    probeCounters.set(key, { count: 1, resetAt: now + 10 * 60 * 1000 });
  } else {
    row.count += 1;
    probeCounters.set(key, row);
  }

  return {
    ok: false,
    status: 403,
    reason: 'automated_probe_detected',
    indicator: uaHit ? `ua:${uaHit}` : `path:${pathHit}`,
  };
}

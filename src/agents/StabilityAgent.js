class StabilityAgent {
  constructor() {
    this.maxAttempts = 3;
    this.baseDelayMs = 250;
    this.lastSelfHealTriggerAt = 0;
  }

  logError(context, error, meta = {}) {
    const payload = {
      ts: new Date().toISOString(),
      context,
      message: error?.message || String(error),
      stack: error?.stack || null,
      ...meta,
    };
    console.warn('[StabilityAgent]', payload);
    return payload;
  }

  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async retry(fn, options = {}) {
    const attempts = Math.max(1, options.attempts || this.maxAttempts);
    const baseDelayMs = Math.max(100, options.baseDelayMs || this.baseDelayMs);
    let lastError = null;
    for (let i = 0; i < attempts; i++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        if (i === attempts - 1) break;
        await this.delay(Math.min(3000, baseDelayMs * 2 ** i));
      }
    }
    this.logError('retry_exhausted', lastError, { attempts });
    return null;
  }

  async safeFetch(input, options = {}, fallback = { ok: false, fallback: true }) {
    const res = await this.retry(async () => {
      const response = await fetch(input, options);
      if ([500, 502, 503, 504, 429].includes(response.status) && (options?.method || 'GET').toUpperCase() === 'GET') {
        throw new Error(`transient_http_${response.status}`);
      }
      return response;
    }, { attempts: options?.attempts || 3, baseDelayMs: options?.baseDelayMs || 250 });

    if (!res) return { ok: false, status: 0, fallback: true, data: fallback, response: null };
    try {
      const data = await res.clone().json();
      return { ok: res.ok, status: res.status, fallback: false, data, response: res };
    } catch {
      return { ok: res.ok, status: res.status, fallback: !res.ok, data: res.ok ? {} : fallback, response: res };
    }
  }

  guardAction(fn, meta = {}) {
    return async (...args) => {
      try {
        return await fn(...args);
      } catch (error) {
        this.logError('guarded_action', error, meta);
        return null;
      }
    };
  }

  monitorStatus(status, meta = {}) {
    if ([401, 403, 404, 500, 502].includes(Number(status || 0))) {
      this.logError('http_status_detected', new Error(`http_${status}`), meta);
      this.triggerSelfHealRetry(status, meta).catch(() => null);
    }
  }

  async triggerSelfHealRetry(status, meta = {}) {
    const now = Date.now();
    if (now - this.lastSelfHealTriggerAt < 30000) return;
    this.lastSelfHealTriggerAt = now;
    await this.safeFetch('/api/functions/selfHeal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'publish_incident',
        incident: {
          subsystem: 'GENERAL',
          issue_code: `HTTP_${status}`,
          severity: Number(status) >= 500 ? 'high' : 'medium',
          context: meta,
        }
      }),
      attempts: 2,
      baseDelayMs: 400
    });
  }
}

export const stabilityAgent = new StabilityAgent();

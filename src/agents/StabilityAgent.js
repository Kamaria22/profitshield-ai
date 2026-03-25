class StabilityAgent {
  constructor() {
    this.maxAttempts = 3;
    this.baseDelayMs = 250;
    this.lastSelfHealTriggerAt = 0;
    this.selfHealUnavailableUntil = 0;
    this.criticalFunctionFallbacks = {
      shopifyActivationBootstrap: 'inline_bootstrap_fallback',
      syncShopifyOrders: 'shopifyActivationBootstrap',
      processWebhookQueue: 'shopifyActivationBootstrap',
      dashboardAI: 'entity_summary_fallback',
      registerShopifyWebhooks: 'shopifyActivationBootstrap',
    };
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
    try {
      sessionStorage.setItem(`ps:stability:${context}`, JSON.stringify(payload));
    } catch {}
    return payload;
  }

  rememberMissingFunction(name, meta = {}) {
    const payload = {
      name,
      fallback: this.criticalFunctionFallbacks[name] || null,
      detectedAt: new Date().toISOString(),
      ...meta,
    };
    try {
      localStorage.setItem(`ps:missing-function:${name}`, JSON.stringify(payload));
    } catch {}
    return payload;
  }

  async reportMissingDeployment(name, meta = {}) {
    const incident = this.rememberMissingFunction(name, meta);
    const body = {
      action: 'report_incident',
      tenant_id: meta?.tenant_id || null,
      incident: {
        code: 'missing_function_deployment',
        message: `Missing deployment detected for ${name}`,
        severity: 'high',
        feature: name,
        details: incident,
      },
      data: { selected: { tenant_id: meta?.tenant_id || null } },
      ui_probe: {
        missing_function: name,
        recommended_fallback: incident.fallback,
      }
    };

    for (const endpoint of ['/api/functions/frontendGuardian', '/api/functions/featureGuardian', '/api/functions/selfHeal']) {
      const result = await this.safeFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (result?.ok) return true;
    }
    return false;
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
    const maxRetries = Math.min(2, Math.max(0, options?.retries ?? 2));
    let res = null;
    let lastNetworkError = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        res = await fetch(input, options);
      } catch (error) {
        lastNetworkError = error;
        if (attempt >= maxRetries) break;
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
        continue;
      }

      if (res.status === 429) {
        console.warn("Rate limit detected, stopping retries");
        return { ok: false, rateLimited: true, status: 429, fallback: true, data: fallback, response: res };
      }

      if (res.status === 500 || res.status === 502) {
        if (attempt >= maxRetries) break;
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
        continue;
      }

      break;
    }

    if (!res) {
      if (lastNetworkError) {
        this.logError('safe_fetch_network', lastNetworkError, { input: typeof input === 'string' ? input : null });
      }
      return { ok: false, status: 0, fallback: true, data: fallback, response: null };
    }
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
      if (Number(status) === 404 && meta?.functionName && this.criticalFunctionFallbacks[meta.functionName]) {
        this.reportMissingDeployment(meta.functionName, meta).catch(() => null);
      }
      this.triggerSelfHealRetry(status, meta).catch(() => null);
    }
  }

  async triggerSelfHealRetry(status, meta = {}) {
    const now = Date.now();
    if (now < this.selfHealUnavailableUntil) return;
    if (now - this.lastSelfHealTriggerAt < 30000) return;
    this.lastSelfHealTriggerAt = now;
    const result = await this.safeFetch('/api/functions/selfHeal', {
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
    if (Number(result?.status) === 404) {
      this.selfHealUnavailableUntil = Date.now() + 10 * 60 * 1000;
    }
  }
}

export const stabilityAgent = new StabilityAgent();

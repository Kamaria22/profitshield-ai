import { getCachedRemoteConfig, refreshRemoteConfig } from './remoteConfig';

function safeId() {
  return `inc_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

function maskEmail(email) {
  if (!email) return null;
  const [u, d] = email.split('@');
  if (!d) return '***';
  return `${u.slice(0, 2)}***@${d}`;
}

function inEmbeddedContext() {
  try {
    return window.top !== window.self;
  } catch {
    return true;
  }
}

export class HealthAgent {
  constructor() {
    this.resolverContext = null;
    this.userEmail = null;
    this.networkLog = [];
    this.maxNetworkLog = 50;
    this.started = false;
  }

  setResolverContext(ctx) {
    this.resolverContext = ctx ?? null;
  }

  setUserEmail(email) {
    this.userEmail = email ?? null;
  }

  async init() {
    if (this.started) return;
    this.started = true;

    refreshRemoteConfig().catch(() => {});

    window.addEventListener('error', (event) => {
      const err = event?.error;
      this.report('error', 'window.onerror', err?.stack || String(event.message || 'Unknown error'), {
        source: 'window.error',
      });
    });

    window.addEventListener('unhandledrejection', (event) => {
      const reason = event?.reason;
      const msg = typeof reason === 'string' ? reason : reason?.message || 'Unhandled rejection';
      const stack = reason?.stack || '';
      this.report('error', `unhandledrejection: ${msg}`, stack, { source: 'promise' });
    });

    this.instrumentFetch();

    console.info('[HealthAgent] initialized', {
      embedded: inEmbeddedContext(),
    });
  }

  instrumentFetch() {
    const originalFetch = window.fetch.bind(window);

    window.fetch = async (input, init) => {
      const start = performance.now();
      const method = (init?.method || 'GET').toUpperCase();

      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
          ? input.toString()
          : input.url;

      try {
        const res = await originalFetch(input, init);
        const dur = Math.round(performance.now() - start);

        this.pushNetwork({
          url,
          method,
          status: res.status,
          ok: res.ok,
          durationMs: dur,
        });

        return res;
      } catch (e) {
        const dur = Math.round(performance.now() - start);
        this.pushNetwork({
          url,
          method,
          durationMs: dur,
          error: e?.message || String(e),
        });

        this.report('warn', `fetch failed: ${method} ${url}`, e?.stack, {
          source: 'fetch',
          url,
        });

        throw e;
      }
    };
  }

  pushNetwork(entry) {
    this.networkLog = [...(this.networkLog || []), entry].slice(-this.maxNetworkLog);
  }

  async report(severity, message, stack, tags) {
    const cfg = getCachedRemoteConfig();
    const incident = {
      id: safeId(),
      createdAt: new Date().toISOString(),
      severity,
      message,
      stack,
      tags,
      route: window.location.pathname,
      search: window.location.search,
      userEmailMasked: maskEmail(this.userEmail),
      resolverContext: this.resolverContext,
      network: this.networkLog,
    };

    console[severity === 'error' ? 'error' : severity === 'warn' ? 'warn' : 'info'](
      '[HealthAgent] incident',
      incident
    );

    if (!cfg.enableIncidentUpload) return;

    try {
      await fetch('/api/functions/incidentIngest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ incident }),
      });
      console.info('[HealthAgent] incident uploaded', { id: incident.id });
    } catch (e) {
      console.warn('[HealthAgent] incident upload failed', e);
    }
  }

  async runDemoVideoSyntheticCheck(args) {
    const cfg = getCachedRemoteConfig();
    if (!cfg.enableSyntheticChecks) return { skipped: true };

    const startedAt = Date.now();
    let lastStatus = null;

    const pollUntilReady = async () => {
      if (!cfg.enableVideoAutoRepoll) return { ok: true, note: 'autoRepoll disabled' };

      while (Date.now() - startedAt < cfg.videoAutoRepollMaxMs) {
        lastStatus = await args.fetchStatus().catch((e) => ({ error: e?.message || String(e) }));

        if (lastStatus?.status === 'completed' || lastStatus?.state === 'completed') {
          return { ok: true, note: 'job completed' };
        }

        await new Promise((r) => setTimeout(r, cfg.videoAutoRepollIntervalMs));
      }

      return { ok: false, note: 'timed out waiting for completion', lastStatus };
    };

    const pollResult = await pollUntilReady();
    const proxyProof = await args.tryProxyDownload('720p');

    const pass =
      pollResult.ok &&
      proxyProof.ok &&
      (proxyProof.bytes || 0) >= cfg.minValidDownloadBytes;

    const synthetic = {
      embedded: inEmbeddedContext(),
      pollResult,
      proxyProof,
      pass,
      minValidDownloadBytes: cfg.minValidDownloadBytes,
      elapsedMs: Date.now() - startedAt,
    };

    if (!pass) {
      await this.report(
        'error',
        'DemoVideo synthetic check FAILED',
        undefined,
        { feature: 'demo_video', reason: 'synthetic_failed' }
      );
    } else {
      console.info('[HealthAgent] DemoVideo synthetic check PASSED', synthetic);
    }

    return synthetic;
  }
}

export const healthAgent = new HealthAgent();
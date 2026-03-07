const DEFAULT_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export function jsonSafe(body: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return Response.json(body, { status, headers: { ...DEFAULT_HEADERS, ...extraHeaders } });
}

export function withEndpointGuard(
  name: string,
  handler: (req: Request) => Promise<Response>,
  headers: Record<string, string> = {}
) {
  return async (req: Request) => {
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: { ...DEFAULT_HEADERS, ...headers } });
    }
    try {
      const res = await handler(req);
      return res instanceof Response ? res : jsonSafe({ error: `${name}_invalid_response` }, 500, headers);
    } catch (error) {
      console.error(`[${name}] unhandled`, error);
      return jsonSafe(
        { error: 'internal_error', endpoint: name, message: error?.message || String(error) },
        500,
        headers
      );
    }
  };
}

export function validateEnv(required: string[]) {
  const missing = required.filter((key) => !Deno.env.get(key));
  return { ok: missing.length === 0, missing };
}

export async function safeFilter<T = unknown>(
  filterFn: () => Promise<T[]>,
  fallback: T[] = [],
  context = 'safeFilter'
) {
  try {
    const rows = await filterFn();
    return Array.isArray(rows) ? rows : fallback;
  } catch (error) {
    console.warn(`[${context}]`, error?.message || String(error));
    return fallback;
  }
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: { attempts?: number; baseMs?: number; context?: string } = {}
) {
  const attempts = Math.max(1, options.attempts || 3);
  const baseMs = Math.max(100, options.baseMs || 250);
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (i === attempts - 1) break;
      const waitMs = baseMs * Math.pow(2, i);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
  console.warn(`[${options.context || 'withRetry'}] exhausted`, lastError?.message || String(lastError));
  throw lastError;
}

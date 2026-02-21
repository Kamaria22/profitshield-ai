const DEFAULT_CONFIG = {
  disableDirectExternalDownloads: true,
  enableSyntheticChecks: true,
  enableIncidentUpload: true,
  enableVideoAutoRepoll: true,
  videoAutoRepollMaxMs: 120000,
  videoAutoRepollIntervalMs: 2000,
  minValidDownloadBytes: 50000,
};

let cached = null;
const CACHE_MS = 60000;

export function getCachedRemoteConfig() {
  return cached?.value ?? DEFAULT_CONFIG;
}

export async function refreshRemoteConfig() {
  const now = Date.now();
  if (cached && now - cached.at < CACHE_MS) return cached.value;

  try {
    const base44Token =
  typeof window !== "undefined"
    ? localStorage.getItem("base44_access_token")
    : null;

let res = await fetch("/api/functions/remoteConfigGet", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    ...(base44Token ? { Authorization: `Bearer ${base44Token}` } : {}),
  },
  credentials: "include",
  body: JSON.stringify({ key: "profitshield_runtime" }),
});

// If the server rejects the Bearer token, try once more using cookies only
if (res.status === 401) {
  res = await fetch("/api/functions/remoteConfigGet", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ key: "profitshield_runtime" }),
  });
}

if (!res.ok) throw new Error(`remoteConfigGet failed: ${res.status}`);
const data = await res.json();

    const merged = { ...DEFAULT_CONFIG, ...(data?.config || {}) };
    cached = { value: merged, at: now };
    return merged;
  } catch (e) {
    cached = { value: DEFAULT_CONFIG, at: now };
    return DEFAULT_CONFIG;
  }
}
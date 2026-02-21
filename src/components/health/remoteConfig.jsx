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
  // TEMP: disable cache while debugging
// if (cached && now - cached.at < CACHE_MS) return cached.value;

  try {
    const base44Token =
  typeof window !== "undefined"
    ? localStorage.getItem("base44_access_token")
    : null;

// If Base44 SDK isn't available yet, just return defaults (don't crash)
if (typeof window === "undefined" || !window.base44?.functions?.invoke) {
  cached = { value: DEFAULT_CONFIG, at: now };
  return DEFAULT_CONFIG;
}

const response = await window.base44?.functions?.invoke?.("remoteConfigGet", {
  key: "profitshield_runtime",
});

if (!response?.data) {
  throw new Error("remoteConfigGet failed: no data returned");
}

const data = response.data;

    const merged = { ...DEFAULT_CONFIG, ...(data?.config || {}) };
    cached = { value: merged, at: now };
    return merged;
  } catch (e) {
  console.warn("remoteConfigGet error:", e);
  cached = { value: DEFAULT_CONFIG, at: now };
  return DEFAULT_CONFIG;
}
}
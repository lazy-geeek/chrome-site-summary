const PREFIX = "page-summary:v1:";
const MAX_ENTRIES = 100;
const MAX_BYTES = 4 * 1024 * 1024;

async function keyFor(url) {
  let parsed;
  try { parsed = new URL(url); } catch { return null; }
  if (!/^(https?:|file:)$/.test(parsed.protocol)) return null;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(parsed.href));
  return PREFIX + Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function getCachedSummary(url) {
  const key = await keyFor(url);
  if (!key) return null;
  const stored = await chrome.storage.local.get(key);
  const entry = stored[key];
  return entry && entry.url === new URL(url).href && typeof entry.summary === "string" && entry.summary.trim() && Number.isFinite(entry.createdAt) ? entry : null;
}

export async function saveCachedSummary(entry) {
  const key = await keyFor(entry.url);
  if (!key || typeof entry.summary !== "string" || !entry.summary.trim()) throw new Error("Ungültige Zusammenfassung");
  // Persist only the result and its source metadata, never raw page text or keys.
  const value = {
    url: new URL(entry.url).href, title: String(entry.title || ""),
    summary: entry.summary, meta: String(entry.meta || ""),
    model: String(entry.model || ""), createdAt: entry.createdAt || Date.now()
  };
  const encoder = new TextEncoder();
  if (encoder.encode(key + JSON.stringify(value)).length > MAX_BYTES) throw new Error("Zusammenfassung zu groß zum Speichern");
  await chrome.storage.local.set({ [key]: value });
  const stored = await chrome.storage.local.get(null);
  const entries = Object.entries(stored).filter(([name]) => name.startsWith(PREFIX))
    .sort(([a, first], [b, second]) => a === key ? -1 : b === key ? 1 : (second.createdAt || 0) - (first.createdAt || 0));
  let bytes = 0;
  const remove = [];
  entries.forEach(([name, data], index) => {
    bytes += encoder.encode(name + JSON.stringify(data)).length;
    if (index >= MAX_ENTRIES || bytes > MAX_BYTES) remove.push(name);
  });
  if (remove.length) await chrome.storage.local.remove(remove);
}

export async function clearCachedSummaries() {
  const stored = await chrome.storage.local.get(null);
  const keys = Object.keys(stored).filter((key) => key.startsWith(PREFIX));
  if (keys.length) await chrome.storage.local.remove(keys);
  return keys.length;
}

export function isSummaryCacheKey(key) { return key.startsWith(PREFIX); }

import test from "node:test";
import assert from "node:assert/strict";
import { getCachedSummary, saveCachedSummary, clearCachedSummaries } from "../cache.js";

function storage(t) {
  const local = { apiKey: "test-key", model: "test/model", unrelated: true };
  globalThis.chrome = { storage: { local: {
    get: async (key) => key === null ? { ...local } : { [key]: local[key] },
    set: async (values) => Object.assign(local, values),
    remove: async (keys) => keys.forEach((key) => delete local[key])
  } } };
  t.after(() => delete globalThis.chrome);
  return local;
}
const entry = (url, createdAt = Date.now()) => ({ url, summary: "Deutsche Zusammenfassung", title: "Artikel", model: "test/model", meta: "Quelle", createdAt });

test("persists by URL independently of tab IDs, keeping query strings and SPA routes distinct", async (t) => {
  const local = storage(t);
  await saveCachedSummary({ ...entry("https://example.org/article?q=1#route-a"), text: "DO NOT STORE RAW CONTENT", apiKey: "DO NOT STORE KEY" });
  assert.equal((await getCachedSummary("https://example.org/article?q=1#route-a")).summary, "Deutsche Zusammenfassung");
  assert.equal(await getCachedSummary("https://example.org/article?q=2#route-a"), null);
  assert.equal(await getCachedSummary("https://example.org/article?q=1#route-b"), null);
  assert.equal(await getCachedSummary("https://other.example/article?q=1#route-a"), null);
  assert(!JSON.stringify(local).includes("DO NOT STORE"));
  assert.equal(await getCachedSummary("chrome://settings"), null);
  await saveCachedSummary({ ...entry("file:///C:/Reports/document.pdf#page=2"), password: "DO NOT STORE PASSWORD" });
  assert.equal((await getCachedSummary("file:///C:/Reports/document.pdf#page=2")).summary, "Deutsche Zusammenfassung");
  assert.equal(await getCachedSummary("file:///C:/Reports/other.pdf#page=2"), null);
  assert(!JSON.stringify(local).includes("DO NOT STORE PASSWORD"));
});

test("replaces a refreshed result without accumulating copies and clearing preserves credentials", async (t) => {
  const local = storage(t);
  await saveCachedSummary(entry("https://example.org/article", 1));
  await saveCachedSummary({ ...entry("https://example.org/article", 2), summary: "Aktualisiert" });
  assert.equal((await getCachedSummary("https://example.org/article")).summary, "Aktualisiert");
  assert.equal(await clearCachedSummaries(), 1);
  assert.deepEqual(local, { apiKey: "test-key", model: "test/model", unrelated: true });
  assert.equal(await getCachedSummary("https://example.org/article"), null);
});

test("evicts oldest results at 100 entries and leaves settings intact", async (t) => {
  const local = storage(t);
  for (let index = 1; index <= 101; index++) await saveCachedSummary(entry(`https://example.org/${index}`, index));
  assert.equal(await getCachedSummary("https://example.org/1"), null);
  assert(await getCachedSummary("https://example.org/101"));
  assert.equal(Object.keys(local).filter((key) => key.startsWith("page-summary:")).length, 100);
  assert.equal(local.apiKey, "test-key");
});

test("evicts to a bounded byte budget and rejects broken cached data", async (t) => {
  const local = storage(t);
  await saveCachedSummary({ ...entry("https://example.org/old", 1), summary: "x".repeat(2500000) });
  await saveCachedSummary({ ...entry("https://example.org/new", 2), summary: "y".repeat(2500000) });
  assert.equal(await getCachedSummary("https://example.org/old"), null);
  assert(await getCachedSummary("https://example.org/new"));
  const key = Object.keys(local).find((key) => key.startsWith("page-summary:"));
  local[key].summary = "";
  assert.equal(await getCachedSummary("https://example.org/new"), null);
});

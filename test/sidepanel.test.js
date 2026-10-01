import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { saveCachedSummary } from "../cache.js";

function event() { const listeners = []; return { addListener: (callback) => listeners.push(callback), emit: (...args) => listeners.forEach((callback) => callback(...args)) }; }
async function until(predicate) {
  for (let i = 0; i < 100; i++) { if (predicate()) return; await new Promise((resolve) => setTimeout(resolve, 5)); }
  assert.fail("UI did not reach the expected state");
}
function response(text) {
  return new Response(`data: ${JSON.stringify({ choices: [{ delta: { content: text }, finish_reason: "stop" }] })}\n\ndata: [DONE]\n\n`);
}

test("PDF tab requests permission in the click, parses locally, summarizes and restores its cache", async (t) => {
  const dom = new JSDOM(readFileSync("sidepanel.html", "utf8"), { url: "https://extension.test/" });
  globalThis.document = dom.window.document; globalThis.window = dom.window;
  const tab = { id: 12, windowId: 1, title: "Report", url: "https://example.org/report.pdf#page=2" };
  const local = {}; let permissions = 0; let requests = 0; let granted = false;
  globalThis.chrome = {
    tabs: { query: async () => [tab], onActivated: event(), onUpdated: event() },
    windows: { getCurrent: async () => ({ id: 1 }) },
    permissions: { request: ({ origins }) => { permissions++; assert.deepEqual(origins, ["https://example.org/*"]); return Promise.resolve(granted); } },
    storage: { local: { setAccessLevel: async () => {}, get: async (key) => Array.isArray(key) ? { apiKey: "test-key", model: "test/model" } : key === null ? local : { [key]: local[key] }, set: async (value) => Object.assign(local, value), remove: async () => {} }, onChanged: event() },
    runtime: { id: "test-extension", onMessage: event() },
    scripting: { executeScript: () => assert.fail("PDF must not inject scripts into Chrome's viewer") }
  };
  t.after(() => { delete globalThis.document; delete globalThis.window; delete globalThis.chrome; dom.window.close(); });
  const pdf = `%PDF-1.4\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj\n4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n5 0 obj << /Length 150 >> stream\nBT /F1 12 Tf 40 700 Td (This report contains the complete research methods, results, conclusions and limitations for a useful document summary.) Tj ET\nendstream endobj\ntrailer << /Root 1 0 R >>\n%%EOF`;
  t.mock.method(globalThis, "fetch", async (url, options) => {
    requests++;
    if (url === tab.url) return new Response(pdf);
    assert.equal(url, "https://openrouter.ai/api/v1/chat/completions");
    assert.match(options.body, /complete research/);
    return response("# Überblick\n\nPDF zusammengefasst.");
  });
  await import(`../sidepanel.js?pdf-test=${Date.now()}`);
  const $ = (id) => document.getElementById(id);
  await until(() => $("model-label").textContent === "test/model");
  $("summarize").click();
  assert.equal(permissions, 1);
  await until(() => !$("error").hidden && !$("summarize").disabled);
  assert.equal(requests, 0); assert.match($("error").textContent, /nicht erlaubt/);
  granted = true; $("summarize").click();
  assert.equal(permissions, 2);
  await until(() => $("status").textContent.startsWith("Zusammenfassung fertig") && !$("summarize").disabled);
  assert.match($("meta").textContent, /PDF · 1 Seiten/);
  assert.equal(requests, 2);
  assert(Object.values(local).some((entry) => entry.url === tab.url));
  chrome.tabs.onUpdated.emit(tab.id, { status: "complete" });
  await until(() => $("status").textContent.startsWith("Gespeicherte Zusammenfassung"));
  assert.equal(requests, 2);
});

test("panel requires manual start, caches complete results and cancels navigation without showing another tab's answer", async (t) => {
  const dom = new JSDOM(readFileSync("sidepanel.html", "utf8"), { url: "https://extension.test/" });
  globalThis.document = dom.window.document;
  globalThis.window = dom.window;
  let tab = { id: 1, windowId: 1, title: "Artikel eins", url: "https://example.org/one" };
  const local = {};
  let networkCalls = 0;
  let extracted = 0;
  let queries = 0;
  const settings = { apiKey: "test-only-key", model: "test/model" };
  const activated = event();
  const updated = event();
  const changed = event();
  globalThis.chrome = {
    tabs: { query: async () => { queries++; return [tab]; }, onActivated: activated, onUpdated: updated },
    windows: { getCurrent: async () => ({ id: 1 }) },
    storage: {
      local: { setAccessLevel: async () => {}, get: async (key) => Array.isArray(key) ? settings : key === null ? { ...local } : { [key]: local[key] }, set: async (values) => Object.assign(local, values), remove: async (keys) => keys.forEach((key) => delete local[key]) },
      onChanged: changed
    },
    runtime: { id: "test-extension", openOptionsPage: async () => {}, onMessage: event() },
    scripting: { executeScript: async () => { extracted++; return [{ result: { title: tab.title, url: tab.url, text: "Quelle ".repeat(100), method: "Hauptinhalt", extractedAt: Date.now() } }]; } }
  };
  t.after(() => { delete globalThis.document; delete globalThis.window; delete globalThis.chrome; dom.window.close(); });
  t.mock.method(globalThis, "fetch", async () => { networkCalls++; return response("# Überblick\n\nDeutsche Zusammenfassung.\n\n## Zentrale Punkte\n- Punkt eins"); });
  await import(`../sidepanel.js?test=${Date.now()}`);
  const $ = (id) => document.getElementById(id);
  await until(() => $("model-label").textContent === settings.model);
  assert.equal(networkCalls, 0);
  assert.equal(extracted, 0);
  assert.equal($("summarize").disabled, false);
  $("summarize").click();
  await until(() => $("status").textContent.startsWith("Zusammenfassung fertig") && !$("summarize").disabled);
  assert.equal(networkCalls, 1);
  assert.equal(extracted, 1);
  assert.match($("summary").textContent, /Deutsche Zusammenfassung/);
  assert(Object.values(local).some((entry) => entry.url === tab.url));
  assert.equal($("copy").disabled, false);

  // A tab in another window must not clear the current result.
  activated.emit({ tabId: 8, windowId: 2 });
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal($("result").hidden, false);

  let aborted = false;
  t.mock.restoreAll();
  t.mock.method(globalThis, "fetch", async (_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener("abort", () => { aborted = true; reject(new DOMException("aborted", "AbortError")); });
  }));
  $("summarize").click();
  await until(() => $("status").textContent === "Zusammenfassung erstellen …");
  await new Promise((resolve) => setTimeout(resolve, 10));
  tab = { id: 2, windowId: 1, title: "Artikel zwei", url: "https://example.org/two" };
  activated.emit({ tabId: 2, windowId: 1 });
  await until(() => $("page-title").textContent === "Artikel zwei");
  assert.equal(aborted, true);
  assert.equal($("result").hidden, true);
  assert.equal($("summary").textContent, "");
  assert.equal($("error").hidden, true);

  // Revisiting the original tab restores its completed snapshot without an API call.
  tab = { id: 1, windowId: 1, title: "Artikel eins", url: "https://example.org/one" };
  activated.emit({ tabId: 1, windowId: 1 });
  await until(() => !$("result").hidden);
  assert.match($("summary").textContent, /Deutsche Zusammenfassung/);
  assert.match($("status").textContent, /Gespeicherte Zusammenfassung/);

  // Revisit in a new tab, as after closing/reopening Chrome: no new request.
  tab = { ...tab, id: 99 };
  const previousQueries = queries;
  activated.emit({ tabId: 99, windowId: 1 });
  await until(() => queries > previousQueries && !$("result").hidden && $("status").textContent.includes("Gespeicherte Zusammenfassung"));
  assert.match($("summary").textContent, /Deutsche Zusammenfassung/);
  updated.emit(99, { status: "loading" });
  await until(() => $("status").textContent.includes("Gespeicherte Zusammenfassung"));
  assert.match($("summary").textContent, /Deutsche Zusammenfassung/);
  tab = { ...tab, title: "Neue SPA-Seite", url: "https://other.example/new" };
  updated.emit(99, { url: tab.url });
  await until(() => $("page-host").textContent === "other.example");
  assert.equal($("result").hidden, true);
  assert.equal(networkCalls, 1);
});

test("a newly opened panel restores a persistent result without a key or API call and reacts to cache deletion", async (t) => {
  const dom = new JSDOM(readFileSync("sidepanel.html", "utf8"), { url: "https://extension.test/" });
  globalThis.document = dom.window.document;
  globalThis.window = dom.window;
  const changed = event();
  const local = {};
  globalThis.chrome = {
    tabs: { query: async () => [{ id: 300, windowId: 1, url: "https://example.org/saved", title: "Gespeicherte Quelle" }], onActivated: event(), onUpdated: event() },
    windows: { getCurrent: async () => ({ id: 1 }) },
    runtime: { id: "test-extension", onMessage: event(), openOptionsPage: async () => {} },
    storage: {
      local: { setAccessLevel: async () => {}, get: async (key) => Array.isArray(key) ? {} : key === null ? { ...local } : { [key]: local[key] }, set: async (values) => Object.assign(local, values), remove: async (keys) => keys.forEach((key) => delete local[key]) },
      onChanged: changed
    },
    scripting: { executeScript: async () => assert.fail("Must not extract a page to restore a cache") }
  };
  t.after(() => { delete globalThis.document; delete globalThis.window; delete globalThis.chrome; dom.window.close(); });
  t.mock.method(globalThis, "fetch", async () => assert.fail("Must not call OpenRouter to restore a cache"));
  await saveCachedSummary({ url: "https://example.org/saved", summary: "Dauerhaft gespeichert", meta: "Originalmodell", createdAt: 1000 });
  await import(`../sidepanel.js?persistent=${Date.now()}`);
  const $ = (id) => document.getElementById(id);
  await until(() => !$("result").hidden && $("status").textContent.includes("Gespeicherte Zusammenfassung"));
  assert.match($("summary").textContent, /Dauerhaft gespeichert/);
  const key = Object.keys(local)[0];
  const oldValue = local[key];
  delete local[key];
  changed.emit({ [key]: { oldValue } }, "local");
  await until(() => $("result").hidden);
  assert.equal($("summary").textContent, "");
});

test("missing tab metadata never locks the button; an action click refreshes access in an already open panel", async (t) => {
  const dom = new JSDOM(readFileSync("sidepanel.html", "utf8"), { url: "https://extension.test/" });
  globalThis.document = dom.window.document;
  globalThis.window = dom.window;
  let tab = { id: 5, windowId: 1 };
  let granted = false;
  let networkCalls = 0;
  const messages = event();
  const updated = event();
  const local = {};
  const page = { title: "Aktueller Artikel", url: "https://example.org/article", text: "Quelle ".repeat(100), method: "Hauptinhalt", extractedAt: Date.now() };
  globalThis.chrome = {
    tabs: { query: async () => [tab], onActivated: event(), onUpdated: updated },
    windows: { getCurrent: async () => ({ id: 1 }) },
    runtime: { id: "test-extension", onMessage: messages, openOptionsPage: async () => {} },
    storage: {
      local: { setAccessLevel: async () => {}, get: async (key) => Array.isArray(key) ? { apiKey: "test-only-key", model: "test/model" } : key === null ? { ...local } : { [key]: local[key] }, set: async (values) => Object.assign(local, values), remove: async (keys) => keys.forEach((key) => delete local[key]) },
      onChanged: event()
    },
    scripting: { executeScript: async () => { if (!granted) throw new Error("Missing host permission"); return [{ result: page }]; } }
  };
  t.after(() => { delete globalThis.document; delete globalThis.window; delete globalThis.chrome; dom.window.close(); });
  t.mock.method(globalThis, "fetch", async () => { networkCalls++; return response("Deutsches Ergebnis"); });
  await import(`../sidepanel.js?missing-metadata=${Date.now()}`);
  const $ = (id) => document.getElementById(id);
  await until(() => $("model-label").textContent === "test/model");
  assert.equal($("summarize").disabled, false);
  $("summarize").click();
  await until(() => !$("error").hidden);
  assert.match($("error").textContent, /Extension-Icon/);
  assert.equal($("summarize").disabled, false);
  assert.equal(networkCalls, 0);

  granted = true;
  tab = { ...tab, url: page.url, title: page.title };
  messages.emit({ type: "PAGE_ACCESS_GRANTED", windowId: 1, tabId: 5 }, { id: "test-extension" });
  await until(() => $("page-title").textContent === page.title);
  assert.equal($("error").hidden, true);
  $("summarize").click();
  await until(() => $("status").textContent.startsWith("Zusammenfassung fertig") && !$("summarize").disabled);
  assert.equal(networkCalls, 1);

  // A permitted extraction may succeed while the query still omitted the URL.
  tab = { id: 5, windowId: 1 };
  messages.emit({ type: "PAGE_ACCESS_GRANTED", windowId: 1, tabId: 5 }, { id: "test-extension" });
  await until(() => $("page-title").textContent === "Aktuelle Webseite");
  $("summarize").click();
  await until(() => $("status").textContent.startsWith("Zusammenfassung fertig") && !$("summarize").disabled);
  assert.equal(networkCalls, 2);
  assert.equal($("page-host").textContent, "example.org");

  tab = { id: 5, windowId: 1, url: "chrome://settings" };
  updated.emit(5, { status: "complete" });
  await until(() => $("model-label").textContent === "test/model" && $("result").hidden);
  assert.equal($("summarize").disabled, true);
});

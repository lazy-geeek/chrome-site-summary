import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";

function event() { const listeners = []; return { addListener: (callback) => listeners.push(callback), emit: (...args) => listeners.forEach((callback) => callback(...args)) }; }
async function until(predicate) {
  for (let i = 0; i < 100; i++) { if (predicate()) return; await new Promise((resolve) => setTimeout(resolve, 5)); }
  assert.fail("UI did not reach the expected state");
}
function response(text) {
  return new Response(`data: ${JSON.stringify({ choices: [{ delta: { content: text }, finish_reason: "stop" }] })}\n\ndata: [DONE]\n\n`);
}

test("panel requires manual start, caches complete results and cancels navigation without showing another tab's answer", async (t) => {
  const dom = new JSDOM(readFileSync("sidepanel.html", "utf8"), { url: "https://extension.test/" });
  globalThis.document = dom.window.document;
  globalThis.window = dom.window;
  let tab = { id: 1, windowId: 1, title: "Artikel eins", url: "https://example.org/one" };
  const session = {};
  let networkCalls = 0;
  let extracted = 0;
  const settings = { apiKey: "test-only-key", model: "test/model" };
  const activated = event();
  const updated = event();
  const changed = event();
  globalThis.chrome = {
    tabs: { query: async () => [tab], onActivated: activated, onUpdated: updated },
    windows: { getCurrent: async () => ({ id: 1 }) },
    storage: {
      local: { setAccessLevel: async () => {}, get: async () => settings },
      session: { get: async () => ({ ...session }), set: async (values) => Object.assign(session, values) },
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
  await until(() => $("status").textContent.startsWith("Zusammenfassung fertig"));
  assert.equal(networkCalls, 1);
  assert.equal(extracted, 1);
  assert.match($("summary").textContent, /Deutsche Zusammenfassung/);
  assert(session["summary:1"]);
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
  const page = { title: "Aktueller Artikel", url: "https://example.org/article", text: "Quelle ".repeat(100), method: "Hauptinhalt", extractedAt: Date.now() };
  globalThis.chrome = {
    tabs: { query: async () => [tab], onActivated: event(), onUpdated: updated },
    windows: { getCurrent: async () => ({ id: 1 }) },
    runtime: { id: "test-extension", onMessage: messages, openOptionsPage: async () => {} },
    storage: {
      local: { setAccessLevel: async () => {}, get: async () => ({ apiKey: "test-only-key", model: "test/model" }) },
      session: { get: async () => ({}), set: async () => {} },
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
  await until(() => $("status").textContent.startsWith("Zusammenfassung fertig"));
  assert.equal(networkCalls, 1);

  // A permitted extraction may succeed while the query still omitted the URL.
  tab = { id: 5, windowId: 1 };
  messages.emit({ type: "PAGE_ACCESS_GRANTED", windowId: 1, tabId: 5 }, { id: "test-extension" });
  await until(() => $("page-title").textContent === "Aktuelle Webseite");
  $("summarize").click();
  await until(() => $("status").textContent.startsWith("Zusammenfassung fertig"));
  assert.equal(networkCalls, 2);
  assert.equal($("page-host").textContent, "example.org");

  tab = { id: 5, windowId: 1, url: "chrome://settings" };
  updated.emit(5, { status: "complete" });
  await until(() => $("model-label").textContent === "test/model" && $("result").hidden);
  assert.equal($("summarize").disabled, true);
});

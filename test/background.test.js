import test from "node:test";
import assert from "node:assert/strict";

function event() { const listeners = []; return { addListener: (callback) => listeners.push(callback), emit: (...args) => listeners.forEach((callback) => callback(...args)) }; }

test("protects key access and removes stale snapshots only when a tab navigates or closes", async (t) => {
  const updated = event();
  const removed = event();
  const deleted = [];
  let accessLevel;
  let panelBehavior;
  globalThis.chrome = {
    storage: {
      local: { setAccessLevel: async (value) => { accessLevel = value.accessLevel; } },
      session: { remove: async (key) => deleted.push(key) }
    },
    sidePanel: { setPanelBehavior: async (value) => { panelBehavior = value.openPanelOnActionClick; } },
    runtime: { onInstalled: event(), onStartup: event() },
    tabs: { onUpdated: updated, onRemoved: removed }
  };
  t.after(() => { delete globalThis.chrome; });
  await import(`../background.js?test=${Date.now()}`);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(accessLevel, "TRUSTED_CONTEXTS");
  assert.equal(panelBehavior, true);
  updated.emit(1, { title: "Neuer Titel" });
  assert.deepEqual(deleted, []);
  updated.emit(1, { status: "loading" });
  updated.emit(2, { url: "https://example.org/new" });
  removed.emit(3);
  assert.deepEqual(deleted, ["summary:1", "summary:2", "summary:3"]);
});

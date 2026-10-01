import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { renderMarkdown } from "../render.js";

test("renders useful Markdown while hostile HTML stays inert text", (t) => {
  const dom = new JSDOM("<div id='result'></div>");
  globalThis.document = dom.window.document;
  t.after(() => { delete globalThis.document; dom.window.close(); });
  const target = document.getElementById("result");
  renderMarkdown(target, '# Überblick\n\nEin **wichtiger** Punkt.\n\n## Zentrale Punkte\n- Eins\n- <img src=x onerror=alert(1)>\n- <script>alert(1)</script>');
  assert.equal(target.querySelectorAll("h3").length, 2);
  assert.equal(target.querySelector("strong").textContent, "wichtiger");
  assert.equal(target.querySelectorAll("li").length, 3);
  assert.equal(target.querySelectorAll("img,script").length, 0);
  assert.match(target.textContent, /<script>/);
  renderMarkdown(target, "Neues Ergebnis");
  assert.equal(target.textContent, "Neues Ergebnis");
});

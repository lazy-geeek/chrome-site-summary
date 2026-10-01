import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { JSDOM } from "jsdom";
import { extractPage } from "../extract.js";

function extract(html, url = "https://example.org/article") {
  const dom = new JSDOM(html, { url, runScripts: "outside-only", pretendToBeVisual: true });
  const result = vm.runInContext(`(${extractPage.toString()})()`, dom.getInternalVMContext());
  dom.window.close();
  return result;
}
const article = "Ein wichtiger Sachverhalt mit Zahlen und Argumenten, der vollständig erfasst werden soll. ".repeat(5);

test("extracts main content below the viewport, ignores navigation, ads, forms and hidden text", () => {
  const result = extract(`<title>Artikel</title><nav>Menü</nav><main><h1>Überschrift</h1><p>${article}</p><p style="margin-top:10000px">Ende des gesamten Artikels</p><p hidden>GEHEIM</p><div style="display:none">GEHEIM</div><p aria-hidden="true">GEHEIM</p><form>GEHEIM<input value="password"></form><div contenteditable="true">GEHEIM</div><aside>Werbung</aside><div class="cookie-banner">Cookies</div></main><footer>Impressum</footer>`);
  assert.equal(result.title, "Artikel");
  assert.match(result.text, /Ende des gesamten Artikels/);
  assert.doesNotMatch(result.text, /GEHEIM|Menü|Werbung|Cookies|Impressum/);
  assert.equal(result.method, "Hauptinhalt");
});
test("ignores articles in hidden ancestors and selects the rendered article", () => {
  const result = extract(`<div style="display:none"><article>${"HIDDEN ".repeat(500)}</article></div><article>${article}</article>`);
  assert.doesNotMatch(result.text, /HIDDEN/);
  assert.match(result.text, /Sachverhalt/);
});
test("falls back to cleaned body and preserves inline spacing and table text", () => {
  const result = extract(`<header>GLOBAL MENU</header><div><p>${article}mit <strong>klarer</strong> Aussage</p><table><tr><td>Preis</td><td>100 Euro</td></tr></table></div>`);
  assert.match(result.text, /mit klarer Aussage/);
  assert.match(result.text, /100 Euro/);
  assert.doesNotMatch(result.text, /GLOBAL MENU/);
  assert.match(result.method, /kein eindeutiger Artikel/);
});
test("rejects empty, unsupported and excessive content without silently truncating", () => {
  assert.match(extract("<main>Hallo</main>").error, /zu wenig/);
  assert.match(extract(`<main>${article}</main>`, "chrome://settings").error, /nicht unterstützt/);
  assert.match(extract(`<article>${"a".repeat(120001)}</article>`).error, /120.000/);
});
test("closed details are excluded; open details remain part of loaded content", () => {
  const result = extract(`<main>${article}<details><summary>Geschlossen</summary>VERSTECKT</details><details open><summary>Offen</summary>Sichtbares Detail</details></main>`);
  assert.doesNotMatch(result.text, /VERSTECKT/);
  assert.match(result.text, /Sichtbares Detail/);
});
test("reads open shadow roots without changing the original document", () => {
  const dom = new JSDOM(`<main>${article}<custom-article></custom-article></main>`, { url: "https://example.org", runScripts: "outside-only" });
  dom.window.document.querySelector("custom-article").attachShadow({ mode: "open" }).innerHTML = "<p>Text im Shadow DOM</p>";
  const before = dom.window.document.body.innerHTML;
  const result = vm.runInContext(`(${extractPage.toString()})()`, dom.getInternalVMContext());
  assert.match(result.text, /Text im Shadow DOM/);
  assert.equal(dom.window.document.body.innerHTML, before);
  dom.window.close();
});

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
  assert.match(result.text, /Preis \| 100 Euro/);
  assert.doesNotMatch(result.text, /GLOBAL MENU/);
  assert.match(result.method, /kein eindeutiger Artikel/);
});

const scholarlyMeta = '<meta name="citation_title" content="Studie"><meta name="citation_doi" content="10.1234/study">';

test("ScienceDirect keeps the abstract, results, discussion and captions while excluding appendices and unrelated recommendations", () => {
  const result = extract(`${scholarlyMeta}<main><h1>Studientitel</h1><div id="abstracts"><h2>Abstract</h2><p>Abstrakt zur Forschung</p></div><div id="body"><div>
    <section><h2>1. Introduction</h2><p>${article}</p></section>
    <section><h2>4. Results</h2><table><tr><th>Skill</th><th>Premium</th></tr><tr><td>KI</td><td>23 %</td></tr></table><figure><figcaption>Bildunterschrift mit Ergebnis</figcaption></figure></section>
    <section><h2>5. Discussion and conclusion</h2><p>Grenzen und Schlussfolgerungen</p></section>
    <section><h2>Authors statement</h2><p>NICHT SENDEN</p></section>
    <section><h2>Appendix 1. Skills</h2><h3>Details</h3><p>${"ANHANG ".repeat(20000)}</p></section>
    <section><h2>CRediT authorship contribution statement</h2><p>NICHT SENDEN</p></section>
  </div></div><section><h2>References</h2><p>NICHT SENDEN</p></section><div id="recommended-articles"><h2>Recommended articles</h2><p>FREMDER ARTIKEL</p></div><div id="cited-by">FREMDER ARTIKEL</div></main>`, "https://www.sciencedirect.com/science/article/pii/test");
  assert.equal(result.error, undefined);
  assert.match(result.text, /Abstrakt zur Forschung/);
  assert.match(result.text, /KI \| 23 %/);
  assert.match(result.text, /Bildunterschrift mit Ergebnis/);
  assert.match(result.text, /Grenzen und Schlussfolgerungen/);
  assert.doesNotMatch(result.text, /NICHT SENDEN|ANHANG|FREMDER ARTIKEL/);
  assert.match(result.method, /Wissenschaftlicher Artikel/);
});

test("scientific filtering supports flat headings and resumes at a subsequent substantive section", () => {
  const result = extract(`${scholarlyMeta}<article><h1>Studie</h1><h2>Abstract</h2><p>${article}</p><h2>Appendix</h2><p>ANHANG</p><h2>Discussion</h2><p>WICHTIGE GRENZE</p><h2>References</h2><p>LITERATUR</p><h3>Weitere Quellen</h3><p>LITERATUR</p></article>`);
  assert.match(result.text, /WICHTIGE GRENZE/);
  assert.doesNotMatch(result.text, /ANHANG|LITERATUR/);
});

test("ordinary articles keep sections named References or Appendix", () => {
  const result = extract(`<article><h1>Programmierhandbuch</h1><p>${article}</p><section><h2>References</h2><p>Wichtige API-Referenz</p></section><section><h2>Appendix</h2><p>Wichtiges Beispiel</p></section></article>`);
  assert.match(result.text, /Wichtige API-Referenz/);
  assert.match(result.text, /Wichtiges Beispiel/);
});

test("a ScienceDirect abstract-only page remains usable without claiming access to hidden full text", () => {
  const result = extract(`${scholarlyMeta}<main><h1>Studie</h1><div id="abstracts"><h2>Abstract</h2><p>${article}</p></div><div id="body" hidden>VERSTECKTER VOLLTEXT</div></main>`, "https://www.sciencedirect.com/science/article/pii/test");
  assert.match(result.text, /Sachverhalt/);
  assert.doesNotMatch(result.text, /VERSTECKTER VOLLTEXT/);
  assert.match(result.method, /nur Abstract verfügbar/);
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

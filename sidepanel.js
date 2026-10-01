import { extractPage } from "./extract.js";
import { loadSettings } from "./settings.js";
import { summarizePage } from "./openrouter.js";
import { renderMarkdown } from "./render.js";

const $ = (id) => document.getElementById(id);
let currentTab;
let controller;
let summaryText = "";
let revision = 0;

function showError(message) { $("error").textContent = message; $("error").hidden = false; }
function clearResult() {
  summaryText = ""; $("summary").replaceChildren(); $("meta").textContent = "";
  $("result").hidden = true; $("empty").hidden = false; $("copy").disabled = true;
}
function stop() {
  controller?.abort(); controller = undefined;
  $("cancel").hidden = true; $("summarize").disabled = !currentTab || !/^https?:\/\//.test(currentTab.url || "");
}
async function refresh() {
  const version = ++revision;
  stop(); clearResult(); $("status").textContent = ""; $("error").hidden = true;
  currentTab = undefined; $("summarize").disabled = true;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (version !== revision) return;
    currentTab = tab;
    $("page-title").textContent = tab?.title || "Aktuelle Webseite";
    $("page-host").textContent = tab?.url && /^https?:\/\//.test(tab.url) ? new URL(tab.url).hostname : "Klicke auf dieser Webseite auf das Extension-Icon, um Zugriff zu erlauben.";
    $("summarize").disabled = !tab?.url || !/^https?:\/\//.test(tab.url);
    const stored = tab ? await chrome.storage.session.get(`summary:${tab.id}`) : {};
    if (version !== revision) return;
    const cached = stored[`summary:${tab?.id}`];
    if (cached && cached.url === tab.url) {
      summaryText = cached.summary; renderMarkdown($("summary"), summaryText);
      $("meta").textContent = cached.meta; $("result").hidden = false; $("empty").hidden = true; $("copy").disabled = false;
      $("summarize").textContent = "Erneut zusammenfassen";
    } else $("summarize").textContent = "Seite zusammenfassen";
    const settings = await loadSettings();
    if (version !== revision) return;
    $("model-label").textContent = settings.model;
    if (!settings.apiKey) $("status").textContent = "Hinterlege zuerst deinen API-Key über die Einstellungen (⚙).";
  } catch { if (version === revision) showError("Die aktuelle Seite konnte nicht geladen werden. Bitte öffne die Seitenleiste erneut."); }
}

$("settings").addEventListener("click", () => chrome.runtime.openOptionsPage());
$("cancel").addEventListener("click", () => {
  revision++; stop(); clearResult(); $("status").textContent = "Abgebrochen. Bereits verarbeitete Anfragen können berechnet werden.";
});
$("copy").addEventListener("click", async () => {
  try { await navigator.clipboard.writeText(summaryText); $("status").textContent = "Zusammenfassung kopiert."; }
  catch { showError("Kopieren ist nicht möglich. Du kannst den Text markieren und manuell kopieren."); }
});
$("summarize").addEventListener("click", async () => {
  if (controller || !currentTab) return;
  const tab = { ...currentTab };
  const version = ++revision;
  const job = new AbortController(); controller = job;
  $("summarize").disabled = true; $("cancel").hidden = false; $("error").hidden = true;
  clearResult(); $("status").textContent = "Hauptinhalt auslesen …";
  try {
    const settings = await loadSettings();
    if (!settings.apiKey) throw new Error("Bitte hinterlege zuerst deinen OpenRouter API-Key über die Einstellungen (⚙).");
    $("model-label").textContent = settings.model;
    let extraction;
    try {
      extraction = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: extractPage });
    } catch { throw new Error("Kein Zugriff auf den Seiteninhalt. Klicke auf dieser Webseite erneut auf das Extension-Icon. Chrome-interne Seiten, der Web Store und PDFs werden nicht unterstützt."); }
    job.signal.throwIfAborted();
    const page = extraction?.[0]?.result;
    if (!page) throw new Error("Es konnte kein Seiteninhalt erfasst werden.");
    if (page.error) throw new Error(page.error);
    if (page.url !== tab.url) throw new Error("Die Seite hat sich während des Auslesens geändert. Bitte starte erneut.");
    $("page-title").textContent = page.title;
    const summary = await summarizePage(page, settings, {
      signal: job.signal,
      onProgress: (message) => { if (version === revision) $("status").textContent = message; },
      onDelta: (text) => { if (version === revision) { $("empty").hidden = true; $("result").hidden = false; renderMarkdown($("summary"), text); } }
    });
    if (version !== revision) return;
    summaryText = summary;
    renderMarkdown($("summary"), summary);
    const meta = `${page.method} · ${page.text.length.toLocaleString("de-DE")} Zeichen · ${settings.model} · ${new Date(page.extractedAt).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}`;
    $("meta").textContent = meta; $("copy").disabled = false;
    $("empty").hidden = true; $("result").hidden = false;
    $("status").textContent = "Zusammenfassung fertig. Sie basiert auf dem Inhalt zum Zeitpunkt des Starts.";
    $("summarize").textContent = "Erneut zusammenfassen";
    try { await chrome.storage.session.set({ [`summary:${tab.id}`]: { url: page.url, summary, meta } }); }
    catch { if (version === revision) $("status").textContent += " Das Ergebnis konnte nicht zwischengespeichert werden."; }
  } catch (failure) {
    if (version !== revision) return;
    clearResult(); $("status").textContent = "";
    if (failure.name !== "AbortError") showError(failure.message);
  } finally { if (version === revision) stop(); }
});
chrome.tabs.onActivated.addListener(async (info) => {
  const window = await chrome.windows.getCurrent();
  if (window.id === info.windowId) refresh();
});
chrome.tabs.onUpdated.addListener((tabId, change) => {
  if (tabId === currentTab?.id && (change.url || change.status === "loading" || change.status === "complete")) refresh();
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && (changes.apiKey || changes.model)) {
    loadSettings().then((settings) => { $("model-label").textContent = settings.model; if (!controller) $("status").textContent = settings.apiKey ? "Einstellungen aktualisiert." : "Bitte hinterlege einen API-Key in den Einstellungen."; }).catch(() => {});
  }
});
window.addEventListener("pagehide", () => controller?.abort());
refresh();

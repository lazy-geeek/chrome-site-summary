import { extractPage } from "./extract.js";
import { loadSettings } from "./settings.js";
import { summarizePage } from "./openrouter.js";
import { renderMarkdown } from "./render.js";
import { getCachedSummary, saveCachedSummary, isSummaryCacheKey } from "./cache.js";
import { isPdfUrl, requestPdfAccess, downloadPdf, extractPdf } from "./pdf.js";

const $ = (id) => document.getElementById(id);
let currentTab;
let controller;
let summaryText = "";
let revision = 0;
let pdfRetry = false;

function canAttempt(tab) {
  // Without activeTab Chrome can omit metadata. Missing URL is not evidence
  // that the page is unsupported; executeScript will check actual access.
  return Number.isInteger(tab?.id) && tab.id >= 0 && (!tab.url || /^https?:\/\//.test(tab.url) || isPdfUrl(tab.url));
}

function showError(message) { $("error").textContent = message; $("error").hidden = false; }
function clearResult() {
  summaryText = ""; $("summary").replaceChildren(); $("meta").textContent = "";
  $("result").hidden = true; $("empty").hidden = false; $("copy").disabled = true;
}
function stop() {
  controller?.abort(); controller = undefined;
  $("cancel").hidden = true; $("summarize").disabled = !canAttempt(currentTab);
}
async function refresh() {
  const version = ++revision;
  pdfRetry = false; $("pdf-password-row").hidden = true; $("pdf-password").value = "";
  stop(); clearResult(); $("status").textContent = ""; $("error").hidden = true;
  $("summarize").textContent = "Seite zusammenfassen";
  currentTab = undefined; $("summarize").disabled = true;
  try {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = activeTab ? { ...activeTab, url: activeTab.pendingUrl || activeTab.url } : undefined;
    if (version !== revision) return;
    currentTab = tab;
    $("page-title").textContent = tab?.title || "Aktuelle Webseite";
    $("page-host").textContent = tab?.url?.startsWith("file:") ? "Lokale PDF-Datei" : tab?.url && /^https?:\/\//.test(tab.url) ? new URL(tab.url).hostname : "Klicke auf dieser Webseite auf das Extension-Icon, um Zugriff zu erlauben.";
    const cached = currentTab?.url && !tab.incognito ? await getCachedSummary(currentTab.url) : null;
    if (version !== revision) return;
    if (cached) {
      summaryText = cached.summary; renderMarkdown($("summary"), summaryText);
      $("meta").textContent = cached.meta; $("result").hidden = false; $("empty").hidden = true; $("copy").disabled = false;
      $("summarize").textContent = "Erneut zusammenfassen";
      $("status").textContent = `Gespeicherte Zusammenfassung vom ${new Date(cached.createdAt).toLocaleString("de-DE")} geladen. Zum Aktualisieren erneut zusammenfassen.`;
    } else $("summarize").textContent = "Seite zusammenfassen";
    $("summarize").disabled = !canAttempt(tab);
    const settings = await loadSettings();
    if (version !== revision) return;
    $("model-label").textContent = settings.model;
    if (!settings.apiKey && !cached) $("status").textContent = "Hinterlege zuerst deinen API-Key über die Einstellungen (⚙).";
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
  const usePdf = isPdfUrl(tab.url) || pdfRetry;
  const access = usePdf ? requestPdfAccess(tab.url) : undefined;
  const version = ++revision;
  const job = new AbortController(); controller = job;
  $("summarize").disabled = true; $("cancel").hidden = false; $("error").hidden = true;
  clearResult(); $("status").textContent = "Hauptinhalt auslesen …";
  try {
    if (access && !await access) throw new Error("Der Zugriff auf die PDF-Adresse wurde nicht erlaubt. Bitte starte erneut und erlaube den Zugriff.");
    job.signal.throwIfAborted();
    const settings = await loadSettings();
    job.signal.throwIfAborted();
    if (!settings.apiKey) throw new Error("Bitte hinterlege zuerst deinen OpenRouter API-Key über die Einstellungen (⚙).");
    $("model-label").textContent = settings.model;
    let page;
    if (usePdf) {
      if (tab.url.startsWith("file:") && !await chrome.extension.isAllowedFileSchemeAccess()) throw new Error("Aktiviere unter chrome://extensions → Chrome Site Summary → Details die Option „Zugriff auf Datei-URLs zulassen“ und starte erneut.");
      $("status").textContent = "PDF-Datei laden …";
      const data = await downloadPdf(tab.url, AbortSignal.any([job.signal, AbortSignal.timeout(60000)]));
      page = await extractPdf(data, { url: tab.url, title: tab.title || "PDF-Dokument", signal: job.signal,
        password: $("pdf-password").value || undefined,
        onProgress: (message) => { if (version === revision) $("status").textContent = message; } });
      $("pdf-password").value = ""; $("pdf-password-row").hidden = true;
    } else {
      let extraction;
      try { extraction = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: extractPage }); }
      catch {
        pdfRetry = true; $("summarize").textContent = "Als PDF versuchen";
        throw new Error("Kein Zugriff auf den Seiteninhalt. Klicke erneut auf das Extension-Icon. Falls der Tab eine PDF ohne .pdf-Endung zeigt, wähle „Als PDF versuchen“. Chrome-interne Seiten und der Web Store werden nicht unterstützt.");
      }
      page = extraction?.[0]?.result;
      if (page?.kind === "pdf") {
        pdfRetry = true; $("summarize").textContent = "PDF zusammenfassen";
        throw new Error("PDF erkannt. Klicke auf „PDF zusammenfassen“, um den Zugriff auf die Datei zu erlauben.");
      }
    }
    job.signal.throwIfAborted();
    if (!page) throw new Error("Es konnte kein Seiteninhalt erfasst werden.");
    if (page.error) throw new Error(page.error);
    if (tab.url && page.url !== tab.url) throw new Error("Die Seite hat sich während des Auslesens geändert. Bitte starte erneut.");
    $("page-title").textContent = page.title;
    $("page-host").textContent = new URL(page.url).hostname || "Lokale PDF-Datei";
    const summary = await summarizePage(page, settings, {
      signal: job.signal,
      onProgress: (message) => { if (version === revision) $("status").textContent = message; },
      onDelta: (text) => { if (version === revision) { $("empty").hidden = true; $("result").hidden = false; renderMarkdown($("summary"), text); } }
    });
    if (version !== revision) return;
    summaryText = summary;
    renderMarkdown($("summary"), summary);
    const meta = `${page.method} · ${page.text.length.toLocaleString("de-DE")} Zeichen · ${settings.model} · ${new Date(page.extractedAt).toLocaleString("de-DE")}`;
    $("meta").textContent = meta; $("copy").disabled = false;
    $("empty").hidden = true; $("result").hidden = false;
    $("status").textContent = "Zusammenfassung fertig. Sie basiert auf dem Inhalt zum Zeitpunkt des Starts.";
    if (page.warning) $("status").textContent += ` ${page.warning}`;
    $("summarize").textContent = "Erneut zusammenfassen";
    if (tab.incognito) $("status").textContent += " Im Inkognito-Modus wird das Ergebnis nicht dauerhaft gespeichert.";
    else {
      try { await saveCachedSummary({ url: page.url, title: page.title, summary, meta, model: settings.model, createdAt: page.extractedAt }); }
      catch { if (version === revision) $("status").textContent += " Das Ergebnis konnte nicht dauerhaft gespeichert werden."; }
    }
  } catch (failure) {
    if (version !== revision) return;
    clearResult(); $("status").textContent = "";
    if (failure.code === "PDF_PASSWORD") $("pdf-password-row").hidden = false;
    if (failure.name !== "AbortError") showError(failure.name === "TimeoutError" ? "Die PDF konnte nicht innerhalb einer Minute geladen werden. Bitte starte erneut." : failure.message);
  } finally { if (version === revision) stop(); }
});
chrome.tabs.onActivated.addListener(async (info) => {
  const window = await chrome.windows.getCurrent();
  if (window.id === info.windowId) refresh();
});
chrome.runtime.onMessage.addListener((message, sender) => {
  if (sender.id !== chrome.runtime.id || message.type !== "PAGE_ACCESS_GRANTED") return;
  chrome.windows.getCurrent().then((window) => {
    if (window.id === message.windowId) refresh();
  }).catch(() => {});
});
chrome.tabs.onUpdated.addListener((tabId, change) => {
  if (tabId === currentTab?.id && (change.url || change.status === "loading" || change.status === "complete")) refresh();
  else if (tabId === currentTab?.id && change.title) $("page-title").textContent = change.title;
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && !controller && !currentTab?.incognito && Object.entries(changes).some(([key, value]) =>
    isSummaryCacheKey(key) && (value.newValue?.url === currentTab?.url || value.oldValue?.url === currentTab?.url))) refresh();
  if (area === "local" && (changes.apiKey || changes.model)) {
    loadSettings().then((settings) => { $("model-label").textContent = settings.model; if (!controller) $("status").textContent = settings.apiKey ? "Einstellungen aktualisiert." : "Bitte hinterlege einen API-Key in den Einstellungen."; }).catch(() => {});
  }
});
window.addEventListener("pagehide", () => controller?.abort());
refresh();

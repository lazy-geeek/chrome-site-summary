import { extractPage } from "./extract.js";
import { loadSettings } from "./settings.js";
import { summarizePage } from "./openrouter.js";
import { renderMarkdown } from "./render.js";
import { getCachedSummary, saveCachedSummary, isSummaryCacheKey } from "./cache.js";
import { isPdfUrl, requestPdfAccess, downloadPdf, extractPdf } from "./pdf.js";

const $ = (id) => document.getElementById(id);
const jobs = new Map();
let currentTab;
let summaryText = "";
let revision = 0;

function canAttempt(tab) {
  return Number.isInteger(tab?.id) && tab.id >= 0 && (!tab.url || /^https?:\/\//.test(tab.url) || isPdfUrl(tab.url));
}
function visibleJob() {
  const job = jobs.get(currentTab?.id);
  return job && (!currentTab.url || !job.tab.url || job.tab.url === currentTab.url) ? job : undefined;
}
function showError(message) { $("error").textContent = message; $("error").hidden = false; }
function clearResult() {
  summaryText = ""; $("summary").replaceChildren(); $("meta").textContent = "";
  $("result").hidden = true; $("empty").hidden = false; $("copy").disabled = true;
}
function updateBackgroundJobs() {
  const count = [...jobs.values()].filter((job) => job.running && job !== visibleJob()).length;
  $("background-jobs").hidden = count === 0;
  $("background-jobs").textContent = count === 1 ? "1 Zusammenfassung läuft in einem anderen Tab weiter." : `${count} Zusammenfassungen laufen in anderen Tabs weiter.`;
}
function renderJob(job) {
  updateBackgroundJobs();
  if (visibleJob() !== job) return;
  $("status").textContent = job.status;
  $("error").hidden = !job.error;
  if (job.error) $("error").textContent = job.error;
  $("summarize").disabled = job.running || !canAttempt(currentTab);
  $("summarize").textContent = job.button || (job.complete ? "Erneut zusammenfassen" : "Seite zusammenfassen");
  $("cancel").hidden = !job.running;
  $("pdf-password-row").hidden = !job.passwordRequired;
  if (job.model) $("model-label").textContent = job.model;
  if (job.page) {
    $("page-title").textContent = job.page.title;
    $("page-host").textContent = new URL(job.page.url).hostname || "Lokale PDF-Datei";
  }
  if (job.text) {
    summaryText = job.complete ? job.text : "";
    renderMarkdown($("summary"), job.text);
    $("empty").hidden = true; $("result").hidden = false;
    $("meta").textContent = job.meta || ""; $("copy").disabled = !job.complete;
  } else clearResult();
}
async function refresh() {
  const version = ++revision;
  $("pdf-password-row").hidden = true; $("pdf-password").value = "";
  clearResult(); $("status").textContent = ""; $("error").hidden = true;
  $("cancel").hidden = true; $("summarize").textContent = "Seite zusammenfassen";
  currentTab = undefined; $("summarize").disabled = true;
  try {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (version !== revision) return;
    currentTab = activeTab ? { ...activeTab, url: activeTab.pendingUrl || activeTab.url } : undefined;
    updateBackgroundJobs();
    $("page-title").textContent = currentTab?.title || "Aktuelle Webseite";
    $("page-host").textContent = currentTab?.url?.startsWith("file:") ? "Lokale PDF-Datei" : currentTab?.url && /^https?:\/\//.test(currentTab.url) ? new URL(currentTab.url).hostname : "Klicke auf dieser Webseite auf das Extension-Icon, um Zugriff zu erlauben.";
    const cached = currentTab?.url && !currentTab.incognito ? await getCachedSummary(currentTab.url) : null;
    if (version !== revision) return;
    if (cached) {
      summaryText = cached.summary; renderMarkdown($("summary"), summaryText);
      $("meta").textContent = cached.meta; $("result").hidden = false; $("empty").hidden = true; $("copy").disabled = false;
      $("summarize").textContent = "Erneut zusammenfassen";
      $("status").textContent = `Gespeicherte Zusammenfassung vom ${new Date(cached.createdAt).toLocaleString("de-DE")} geladen. Zum Aktualisieren erneut zusammenfassen.`;
    }
    $("summarize").disabled = !canAttempt(currentTab);
    const settings = await loadSettings();
    if (version !== revision) return;
    $("model-label").textContent = settings.model;
    if (!settings.apiKey && !cached) $("status").textContent = "Hinterlege zuerst deinen API-Key über die Einstellungen (⚙).";
    // Running jobs override old cached results and restore their partial text.
    const job = visibleJob();
    if (job && (job.running || job.error || !cached)) renderJob(job);
  } catch { if (version === revision) showError("Die aktuelle Seite konnte nicht geladen werden. Bitte öffne die Seitenleiste erneut."); }
}

$("settings").addEventListener("click", () => chrome.runtime.openOptionsPage());
$("cancel").addEventListener("click", () => {
  const job = visibleJob();
  if (!job?.running) return;
  job.controller.abort(); job.running = false; job.text = ""; job.error = "";
  job.status = "Abgebrochen. Bereits verarbeitete Anfragen können berechnet werden.";
  renderJob(job);
});
$("copy").addEventListener("click", async () => {
  try { await navigator.clipboard.writeText(summaryText); $("status").textContent = "Zusammenfassung kopiert."; }
  catch { showError("Kopieren ist nicht möglich. Du kannst den Text markieren und manuell kopieren."); }
});
$("summarize").addEventListener("click", async () => {
  if (!currentTab || visibleJob()?.running) return;
  const tab = { ...currentTab };
  const usePdf = isPdfUrl(tab.url) || visibleJob()?.pdfRetry;
  const access = usePdf ? requestPdfAccess(tab.url) : undefined;
  const password = $("pdf-password").value || undefined;
  $("pdf-password").value = "";
  const controller = new AbortController();
  const job = { tab, controller, running: true, text: "", status: "Hauptinhalt auslesen …", pdfRetry: usePdf };
  jobs.set(tab.id, job); renderJob(job);
  const update = (status) => { if (!controller.signal.aborted) { job.status = status; renderJob(job); } };
  try {
    if (access && !await access) throw new Error("Der Zugriff auf die PDF-Adresse wurde nicht erlaubt. Bitte starte erneut und erlaube den Zugriff.");
    controller.signal.throwIfAborted();
    const settings = await loadSettings();
    controller.signal.throwIfAborted();
    if (!settings.apiKey) throw new Error("Bitte hinterlege zuerst deinen OpenRouter API-Key über die Einstellungen (⚙).");
    job.model = settings.model; renderJob(job);
    let page;
    if (usePdf) {
      if (tab.url.startsWith("file:") && !await chrome.extension.isAllowedFileSchemeAccess()) throw new Error("Aktiviere unter chrome://extensions → Chrome Site Summary → Details die Option „Zugriff auf Datei-URLs zulassen“ und starte erneut.");
      update("PDF-Datei laden …");
      const data = await downloadPdf(tab.url, AbortSignal.any([controller.signal, AbortSignal.timeout(60000)]));
      page = await extractPdf(data, { url: tab.url, title: tab.title || "PDF-Dokument", signal: controller.signal, password, onProgress: update });
    } else {
      let extraction;
      try { extraction = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: extractPage }); }
      catch {
        job.pdfRetry = true; job.button = "Als PDF versuchen";
        throw new Error("Kein Zugriff auf den Seiteninhalt. Klicke erneut auf das Extension-Icon. Falls der Tab eine PDF ohne .pdf-Endung zeigt, wähle „Als PDF versuchen“. Chrome-interne Seiten und der Web Store werden nicht unterstützt.");
      }
      page = extraction?.[0]?.result;
      if (page?.kind === "pdf") {
        job.pdfRetry = true; job.button = "PDF zusammenfassen";
        throw new Error("PDF erkannt. Klicke auf „PDF zusammenfassen“, um den Zugriff auf die Datei zu erlauben.");
      }
    }
    controller.signal.throwIfAborted();
    if (!page) throw new Error("Es konnte kein Seiteninhalt erfasst werden.");
    if (page.error) throw new Error(page.error);
    if (tab.url && page.url !== tab.url) throw new Error("Die Seite hat sich während des Auslesens geändert. Bitte starte erneut.");
    job.page = { title: page.title, url: page.url }; renderJob(job);
    const summary = await summarizePage(page, settings, {
      signal: controller.signal, onProgress: update,
      onDelta: (text) => { if (!controller.signal.aborted) { job.text = text; renderJob(job); } }
    });
    controller.signal.throwIfAborted();
    job.text = summary;
    job.meta = `${page.method} · ${page.text.length.toLocaleString("de-DE")} Zeichen · ${settings.model} · ${new Date(page.extractedAt).toLocaleString("de-DE")}`;
    job.complete = true;
    update("Zusammenfassung fertig. Sie basiert auf dem Inhalt zum Zeitpunkt des Starts." + (page.warning ? ` ${page.warning}` : ""));
    if (tab.incognito) job.status += " Im Inkognito-Modus wird das Ergebnis nicht dauerhaft gespeichert.";
    else {
      try { await saveCachedSummary({ url: page.url, title: page.title, summary, meta: job.meta, model: settings.model, createdAt: page.extractedAt }); }
      catch { job.status += " Das Ergebnis konnte nicht dauerhaft gespeichert werden."; }
    }
  } catch (failure) {
    if (controller.signal.aborted) return;
    job.text = ""; job.status = ""; job.passwordRequired = failure.code === "PDF_PASSWORD";
    job.error = failure.name === "TimeoutError" ? "Die PDF konnte nicht innerhalb einer Minute geladen werden. Bitte starte erneut." : failure.message;
  } finally { job.running = false; renderJob(job); }
});
chrome.tabs.onActivated.addListener(async (info) => {
  const window = await chrome.windows.getCurrent();
  if (window.id === info.windowId) refresh();
});
chrome.runtime.onMessage.addListener((message, sender) => {
  if (sender.id !== chrome.runtime.id || message.type !== "PAGE_ACCESS_GRANTED") return;
  chrome.windows.getCurrent().then((window) => {
    if (window.id !== message.windowId) return;
    if (!jobs.get(message.tabId)?.running) jobs.delete(message.tabId);
    refresh();
  }).catch(() => {});
});
chrome.tabs.onUpdated.addListener((tabId, change) => {
  // Navigation invalidates the source; activating another tab leaves its job intact.
  if (change.url || change.status === "loading") {
    jobs.get(tabId)?.controller.abort(); jobs.delete(tabId);
    updateBackgroundJobs();
  }
  if (tabId === currentTab?.id && (change.url || change.status === "loading" || change.status === "complete")) refresh();
  else if (tabId === currentTab?.id && change.title) $("page-title").textContent = change.title;
});
chrome.tabs.onRemoved?.addListener((tabId) => { jobs.get(tabId)?.controller.abort(); jobs.delete(tabId); updateBackgroundJobs(); });
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local") {
    const cacheChanges = Object.entries(changes).filter(([key]) => isSummaryCacheKey(key));
    for (const [, value] of cacheChanges) {
      for (const [tabId, job] of jobs) {
        const url = job.tab.url || job.page?.url;
        if (url && !job.running && !job.tab.incognito && (url === value.newValue?.url || url === value.oldValue?.url)) jobs.delete(tabId);
      }
    }
    if (currentTab?.url && !visibleJob()?.running && !currentTab.incognito && cacheChanges.some(([, value]) =>
      value.newValue?.url === currentTab?.url || value.oldValue?.url === currentTab?.url)) refresh();
  }
  if (area === "local" && (changes.apiKey || changes.model)) {
    loadSettings().then((settings) => {
      if (!visibleJob()?.running) { $("model-label").textContent = settings.model; $("status").textContent = settings.apiKey ? "Einstellungen aktualisiert." : "Bitte hinterlege einen API-Key in den Einstellungen."; }
    }).catch(() => {});
  }
});
window.addEventListener("pagehide", () => { for (const job of jobs.values()) job.controller.abort(); jobs.clear(); });
refresh();

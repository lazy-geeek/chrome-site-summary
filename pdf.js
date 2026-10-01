const MAX_BYTES = 25 * 1024 * 1024;
const MAX_CHARACTERS = 120000;

export function isPdfUrl(url) {
  try { return /^(https?:|file:)$/.test(new URL(url).protocol) && /\.pdf$/i.test(new URL(url).pathname); }
  catch { return false; }
}

// Called directly by the click listener, before its first await: Chrome requires
// a user gesture for optional host permission requests.
export function requestPdfAccess(url) {
  try {
    const parsed = new URL(url);
    if (!/^(https?:|file:)$/.test(parsed.protocol)) throw new Error("Diese PDF-Adresse wird nicht unterstützt.");
    const origin = parsed.protocol === "file:" ? "file:///*" : `${parsed.origin}/*`;
    return chrome.permissions.request({ origins: [origin] });
  } catch (error) {
    return Promise.reject(error instanceof TypeError ? new Error("Die PDF-Adresse ist nicht verfügbar. Klicke im PDF-Tab erneut auf das Extension-Icon.") : error);
  }
}

export async function downloadPdf(url, signal) {
  const response = await fetch(url, { credentials: "include", signal });
  if (!response.ok) throw new Error(`Die PDF konnte nicht geladen werden (HTTP ${response.status}).`);
  if (Number(response.headers.get("content-length")) > MAX_BYTES) throw new Error("Die PDF ist größer als 25 MiB.");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Die PDF-Datei enthält keine Daten.");
  const chunks = []; let size = 0;
  try {
    while (true) {
      signal?.throwIfAborted();
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_BYTES) throw new Error("Die PDF ist größer als 25 MiB.");
      chunks.push(value);
    }
  } catch (error) { await reader.cancel().catch(() => {}); throw error; }
  finally { reader.releaseLock(); }
  signal?.throwIfAborted();
  const data = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.length; }
  if (!new TextDecoder("latin1").decode(data.subarray(0, 1024)).includes("%PDF-")) throw new Error("Die Adresse liefert keine PDF-Datei. Eventuell ist eine Anmeldung erforderlich.");
  return data;
}

export async function extractPdf(data, { url, title, signal, onProgress = () => {}, password, pdfjs } = {}) {
  signal?.throwIfAborted();
  const library = pdfjs || await import("./vendor/pdfjs/pdf.min.mjs");
  library.GlobalWorkerOptions.workerSrc = new URL("./vendor/pdfjs/pdf.worker.min.mjs", import.meta.url).href;
  signal?.throwIfAborted();
  // Extension URLs have an opaque URL.origin in PDF.js's same-origin check.
  // Supply a local module worker explicitly so it never creates a blob wrapper
  // rejected by Manifest V3's CSP or falls back to blocking the panel thread.
  const nativeWorker = typeof Worker === "function" && library.PDFWorker
    ? new Worker(library.GlobalWorkerOptions.workerSrc, { type: "module" }) : undefined;
  const pdfWorker = nativeWorker ? new library.PDFWorker({ port: nativeWorker }) : undefined;
  const task = library.getDocument({ data, password, worker: pdfWorker, isEvalSupported: false, disableFontFace: true,
    useSystemFonts: false, useWorkerFetch: false,
    cMapUrl: new URL("./vendor/pdfjs/cmaps/", import.meta.url).href, cMapPacked: true,
    standardFontDataUrl: new URL("./vendor/pdfjs/standard_fonts/", import.meta.url).href });
  const abort = () => { void task.destroy().catch(() => {}); };
  signal?.addEventListener("abort", abort, { once: true });
  try {
    const document = await task.promise;
    if (document.numPages > 500) throw new Error("Die PDF hat mehr als 500 Seiten. Bitte verwende ein kürzeres Dokument.");
    const pages = []; let length = 0; let emptyPages = 0;
    for (let number = 1; number <= document.numPages; number++) {
      signal?.throwIfAborted();
      onProgress(`PDF auslesen: Seite ${number} von ${document.numPages} …`);
      const page = await document.getPage(number);
      const content = await page.getTextContent();
      const text = content.items.map((item) => typeof item.str === "string" ? item.str + (item.hasEOL ? "\n" : " ") : "").join("").replace(/[ \t]+/g, " ").trim();
      page.cleanup();
      if (!text) emptyPages++;
      const section = `[Seite ${number}]\n${text}`;
      length += section.length + 2;
      if (length > MAX_CHARACTERS) throw new Error("Die PDF enthält mehr als 120.000 Zeichen. Bitte verwende ein kürzeres Dokument.");
      pages.push(section);
    }
    signal?.throwIfAborted();
    if (emptyPages === document.numPages) throw new Error("Die PDF enthält keinen auslesbaren Text. Bitte verwende eine PDF mit Textebene oder führe vorher OCR durch.");
    if (length < 100) throw new Error("Die PDF enthält zu wenig Text für eine Zusammenfassung.");
    const warning = emptyPages ? `${emptyPages} von ${document.numPages} Seiten ohne auslesbaren Text; Bilder werden nicht ausgewertet.` : "";
    return { url, title, text: (warning ? `Quellenhinweis: ${warning}\n\n` : "") + pages.join("\n\n"),
      warning, method: `PDF · ${document.numPages} Seiten${warning ? ` · ${warning}` : ""}`, extractedAt: Date.now() };
  } catch (error) {
    signal?.throwIfAborted();
    if (error.name === "PasswordException") {
      const failure = new Error("Die PDF benötigt ein Passwort. Trage es unten ein und starte erneut.");
      failure.code = "PDF_PASSWORD"; throw failure;
    }
    throw error;
  } finally {
    signal?.removeEventListener("abort", abort);
    await task.destroy().catch(() => {});
    pdfWorker?.destroy(); nativeWorker?.terminate();
  }
}

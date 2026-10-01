// Self-contained: Chrome serializes this function into the tab's isolated world.
export function extractPage() {
  if (!/^https?:$/.test(location.protocol)) {
    return { error: "Diese Seite wird nicht unterstützt. Bitte öffne eine normale Webseite (HTTP/HTTPS)." };
  }
  if (document.contentType !== "text/html" && document.contentType !== "application/xhtml+xml") {
    return { error: "Hier ist kein HTML-Seiteninhalt verfügbar. PDF-, Bild- und Videoauswertung sind noch nicht enthalten." };
  }
  const excluded = "script,style,noscript,template,nav,footer,aside,form,input,textarea,select,button,svg,canvas,iframe,[role=navigation],[role=banner],[role=contentinfo],[role=dialog],[aria-modal=true],[hidden],[aria-hidden=true],[contenteditable]:not([contenteditable=false]),.cookie-banner,.cookie-consent,#onetrust-banner-sdk,#CybotCookiebotDialog,[data-ad-slot],.adsbygoogle";
  const boundaries = new Set(["P", "DIV", "SECTION", "ARTICLE", "MAIN", "H1", "H2", "H3", "H4", "H5", "H6", "LI", "UL", "OL", "BLOCKQUOTE", "PRE", "TR", "BR", "HR"]);

  function visible(element) {
    const style = getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden" && style.visibility !== "collapse" && style.opacity !== "0";
  }
  function read(root) {
    const pieces = [];
    function visit(node) {
      if (node.nodeType === Node.TEXT_NODE) {
        pieces.push(node.nodeValue.replace(/\s+/g, " "));
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE || node.matches(excluded) || !visible(node)) return;
      if (node.tagName === "HEADER" && !node.closest("article,main,[role=main]")) return;
      if (boundaries.has(node.tagName)) pieces.push("\n");
      const children = node.tagName === "DETAILS" && !node.open
        ? Array.from(node.children).filter((child) => child.tagName === "SUMMARY")
        : node.childNodes;
      for (const child of children) visit(child);
      if (node.shadowRoot) for (const child of node.shadowRoot.childNodes) visit(child);
      if (boundaries.has(node.tagName)) pieces.push("\n");
    }
    visit(root);
    return pieces.join("").split("\n").map((line) => line.replace(/[ \t]+/g, " ").trim()).filter(Boolean).join("\n\n");
  }
  function eligible(element) {
    for (let current = element; current; current = current.parentElement) {
      if (current.matches(excluded) || !visible(current)) return false;
    }
    return true;
  }
  const candidates = Array.from(document.querySelectorAll("main,[role=main],article,.entry-content,.post-content,.article-body,[itemprop=articleBody]"))
    .filter(eligible).map((root) => ({ root, text: read(root) }))
    .filter(({ text }) => text.length >= 200);
  candidates.sort((a, b) => b.text.length - a.text.length);
  const selected = candidates[0];
  const text = selected?.text || (document.body ? read(document.body) : "");
  if (text.length < 100) return { error: "Es wurde zu wenig lesbarer Text gefunden. Lade die Seite vollständig oder öffne einen Artikel statt einer Video- oder Bildseite." };
  if (text.length > 120000) return { error: "Der Hauptinhalt ist größer als 120.000 Zeichen. Bitte öffne einen kürzeren Artikel oder eine einzelne Unterseite. Es wurde kein Text gesendet." };
  return {
    title: document.title.trim() || "Unbenannte Seite",
    url: location.href,
    text,
    method: selected ? "Hauptinhalt" : "Seiteninhalt (kein eindeutiger Artikel erkannt)",
    extractedAt: Date.now()
  };
}

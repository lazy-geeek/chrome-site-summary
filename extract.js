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
  const scientific = !!document.querySelector('meta[name="citation_title"]') &&
    !!document.querySelector('meta[name="citation_doi"],meta[name="citation_journal_title"]');
  const scientificExcluded = new Set();
  const headingSelector = "h1,h2,h3,h4,h5,h6";
  function ancillaryHeading(node) {
    if (!scientific || !/^H[1-6]$/.test(node.tagName)) return false;
    const title = node.textContent.replace(/^\s*(?:\d+(?:\.\d+)*\.?\s+|[A-Z]\.\s+)/, "").trim();
    return /^(?:references|bibliography|literature cited|literaturverzeichnis|appendix|appendices|supplementary (?:material|information|data)|anhang|anhänge|acknowledg(?:e)?ments|authors?['’]? statements?|authors? contributions?|credit authorship|funding|declaration of|conflicts? of interest|data availability|recommended articles|related articles|cited by|metrics|vitae|author biography|author biographies)\b/i.test(title);
  }
  if (scientific) {
    for (const heading of document.querySelectorAll(headingSelector)) {
      if (!ancillaryHeading(heading)) continue;
      const parent = heading.parentElement;
      if (!parent || parent.matches("article,main,body,[role=main],#body,.article-body")) continue;
      // A section can have subheadings; a generic wrapper is excluded only if
      // it contains this one heading, so the article container stays intact.
      if ((parent.tagName === "SECTION" && parent.querySelector(headingSelector) === heading) ||
          parent.querySelectorAll(headingSelector).length === 1) scientificExcluded.add(parent);
    }
  }

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
      if (scientific && (scientificExcluded.has(node) || node.matches(".bibliography,#references,#recommended-articles,#cited-by,#metrics,.author-group,#author-group,.footnotes"))) return;
      if (node.tagName === "HEADER" && !node.closest("article,main,[role=main]")) return;
      if (boundaries.has(node.tagName)) pieces.push("\n");
      const children = node.tagName === "DETAILS" && !node.open
        ? Array.from(node.children).filter((child) => child.tagName === "SUMMARY")
        : node.childNodes;
      let skipLevel = 0;
      for (const child of children) {
        const level = /^H[1-6]$/.test(child.tagName) ? Number(child.tagName[1]) : 0;
        // Handle articles with flat h2 + paragraph siblings as well as sections.
        if (ancillaryHeading(child)) { skipLevel = level; continue; }
        if (skipLevel && level && level <= skipLevel) skipLevel = 0;
        if (!skipLevel) visit(child);
      }
      if (node.shadowRoot) for (const child of node.shadowRoot.childNodes) visit(child);
      if (node.tagName === "TD" || node.tagName === "TH") pieces.push(" | ");
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
  // ScienceDirect supplies an explicit full-text body, separate from abstracts
  // and recommendations. Read those source areas rather than its entire main.
  const scienceDirect = scientific && /(^|\.)sciencedirect\.com$/.test(location.hostname);
  const paperBody = scienceDirect ? document.querySelector("#body") : null;
  const paperAbstract = scienceDirect ? document.querySelector("#abstracts") : null;
  const paperParts = [document.querySelector("h1"), paperAbstract, paperBody].filter((node) => node && eligible(node));
  const paperContent = scienceDirect ? paperParts.map((node) => ({ node, text: read(node) })) : [];
  const paperText = scienceDirect && paperParts.some((node) => node === paperBody || node === paperAbstract)
    ? paperContent.map((part) => part.text).filter(Boolean).join("\n\n") : "";
  const hasFullText = paperContent.some((part) => part.node === paperBody && part.text.length >= 100);
  const candidates = paperText ? [] : Array.from(document.querySelectorAll("main,[role=main],article,.entry-content,.post-content,.article-body,[itemprop=articleBody]"))
    .filter(eligible).map((root) => ({ root, text: read(root) }))
    .filter(({ text }) => text.length >= 200);
  candidates.sort((a, b) => b.text.length - a.text.length);
  const selected = candidates[0];
  const text = paperText || selected?.text || (document.body ? read(document.body) : "");
  if (text.length < 100) return { error: "Es wurde zu wenig lesbarer Text gefunden. Lade die Seite vollständig oder öffne einen Artikel statt einer Video- oder Bildseite." };
  if (text.length > 120000) return { error: "Der Hauptinhalt ist größer als 120.000 Zeichen. Bitte öffne einen kürzeren Artikel oder eine einzelne Unterseite. Es wurde kein Text gesendet." };
  return {
    title: document.title.trim() || "Unbenannte Seite",
    url: location.href,
    text,
    method: paperText ? hasFullText ? "Wissenschaftlicher Artikel (Abstract und Haupttext)" : "Wissenschaftlicher Artikel (nur Abstract verfügbar)" : scientific ? "Wissenschaftlicher Artikel" : selected ? "Hauptinhalt" : "Seiteninhalt (kein eindeutiger Artikel erkannt)",
    extractedAt: Date.now()
  };
}

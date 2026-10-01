// Build DOM nodes instead of interpreting model output as HTML.
export function renderMarkdown(target, markdown) {
  target.replaceChildren();
  let list;
  let paragraph;
  function inline(element, text) {
    const parts = text.split(/(\*\*[^*]+\*\*)/g);
    for (const part of parts) {
      if (part.startsWith("**") && part.endsWith("**")) {
        const strong = document.createElement("strong");
        strong.textContent = part.slice(2, -2);
        element.append(strong);
      } else element.append(document.createTextNode(part));
    }
  }
  for (const raw of markdown.split("\n")) {
    const line = raw.trim();
    if (!line) { list = null; paragraph = null; continue; }
    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    const item = /^(?:[-*]|\d+[.)])\s+(.+)$/.exec(line);
    if (heading) {
      list = null; paragraph = null;
      const element = document.createElement("h3");
      inline(element, heading[2]); target.append(element);
    } else if (item) {
      paragraph = null;
      if (!list) { list = document.createElement("ul"); target.append(list); }
      const element = document.createElement("li"); inline(element, item[1]); list.append(element);
    } else {
      list = null;
      if (!paragraph) { paragraph = document.createElement("p"); target.append(paragraph); }
      else paragraph.append(document.createTextNode(" "));
      inline(paragraph, line);
    }
  }
}

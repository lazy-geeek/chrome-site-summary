import test from "node:test";
import assert from "node:assert/strict";
import { downloadPdf, extractPdf, isPdfUrl, requestPdfAccess } from "../pdf.js";

function fixture(lines = ["This is a PDF document with enough readable text for a complete summary. Research results and methods are included."]) {
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", `<< /Type /Pages /Kids [${lines.map((_, index) => `${4 + index * 2} 0 R`).join(" ")}] /Count ${lines.length} >>`, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"];
  for (let index = 0; index < lines.length; index++) {
    const stream = `BT /F1 12 Tf 40 700 Td (${lines[index]}) Tj ET`;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + index * 2} 0 R >>`, `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  }
  let pdf = "%PDF-1.4\n"; const offsets = [0];
  objects.forEach((object, index) => { offsets.push(pdf.length); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => String(offset).padStart(10, "0") + " 00000 n \n").join("")}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}

test("recognizes remote/local PDF URLs and requests only the source origin synchronously", async () => {
  assert(isPdfUrl("https://example.org/report.PDF?download=1#page=2"));
  assert(isPdfUrl("file:///C:/report.pdf"));
  assert(!isPdfUrl("chrome://settings/report.pdf"));
  let requested;
  globalThis.chrome = { permissions: { request: (value) => { requested = value; return Promise.resolve(true); } } };
  try {
    const promise = requestPdfAccess("https://example.org/report.pdf");
    assert.deepEqual(requested, { origins: ["https://example.org/*"] });
    assert(await promise);
    await requestPdfAccess("file:///C:/report.pdf");
    assert.deepEqual(requested, { origins: ["file:///*"] });
  } finally { delete globalThis.chrome; }
});

test("bundled PDF.js extracts every page with page boundaries", async () => {
  const progress = [];
  const page = await extractPdf(fixture(["First page: Methods and research results with enough text for a useful summary.", "Second page: Conclusions and limitations complete the document in this fixture."]), {
    url: "https://example.org/paper.pdf", title: "Paper", onProgress: (text) => progress.push(text)
  });
  assert.match(page.text, /\[Seite 1\][\s\S]*Methods[\s\S]*\[Seite 2\][\s\S]*Conclusions/);
  assert.equal(page.method, "PDF · 2 Seiten"); assert.equal(progress.length, 2);
});

test("rejects scanned, malformed, oversized and aborted PDFs and marks pages without text", async () => {
  await assert.rejects(extractPdf(fixture([""]), {}), /OCR/);
  const mixed = await extractPdf(fixture(["The first page contains text describing methods, results and conclusions in this research report.", ""]), {});
  assert.match(mixed.warning, /1 von 2/); assert.match(mixed.text, /Quellenhinweis/);
  await assert.rejects(extractPdf(new TextEncoder().encode("%PDF-broken"), {}));
  const controller = new AbortController(); controller.abort();
  await assert.rejects(extractPdf(fixture(), { signal: controller.signal }), { name: "AbortError" });
  const running = new AbortController();
  await assert.rejects(extractPdf(fixture(), { signal: running.signal, onProgress: () => running.abort() }), { name: "AbortError" });
  const pdfjs = { GlobalWorkerOptions: {}, getDocument: () => ({ promise: Promise.resolve({ numPages: 501 }), destroy: async () => {} }) };
  await assert.rejects(extractPdf(fixture(), { pdfjs }), /500 Seiten/);
  const large = { GlobalWorkerOptions: {}, getDocument: () => ({ promise: Promise.resolve({ numPages: 1, getPage: async () => ({ getTextContent: async () => ({ items: [{ str: "A".repeat(120001) }] }), cleanup() {} }) }), destroy: async () => {} }) };
  await assert.rejects(extractPdf(fixture(), { pdfjs: large }), /120.000 Zeichen/);
});

test("password failures offer a retry and parser resources are released", async () => {
  let destroyed = 0;
  const pdfjs = { GlobalWorkerOptions: {}, getDocument: () => ({ promise: Promise.reject(Object.assign(new Error(), { name: "PasswordException" })), destroy: async () => { destroyed++; } }) };
  await assert.rejects(extractPdf(fixture(), { pdfjs }), { code: "PDF_PASSWORD" });
  assert.equal(destroyed, 1);
});

test("download validates PDF bytes and size, uses credentials and supports cancellation", async (t) => {
  let options;
  t.mock.method(globalThis, "fetch", async (_url, init) => { options = init; return new Response(fixture()); });
  const controller = new AbortController();
  assert((await downloadPdf("https://example.org/report.pdf", controller.signal)).length > 100);
  assert.equal(options.credentials, "include"); assert.equal(options.signal, controller.signal);
  t.mock.restoreAll();
  t.mock.method(globalThis, "fetch", async () => new Response("Login page"));
  await assert.rejects(downloadPdf("https://example.org/report.pdf"), /keine PDF/);
  t.mock.restoreAll();
  t.mock.method(globalThis, "fetch", async () => new Response("%PDF-", { headers: { "content-length": 26 * 1024 * 1024 } }));
  await assert.rejects(downloadPdf("https://example.org/report.pdf"), /25 MiB/);
});

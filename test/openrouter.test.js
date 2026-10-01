import test from "node:test";
import assert from "node:assert/strict";
import { complete, splitText, summarizePage } from "../openrouter.js";

function stream(text, finish = "stop") {
  const data = `: comment\r\ndata: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\r\n\r\ndata: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: finish }] })}\n\ndata: [DONE]\n\n`;
  const bytes = new TextEncoder().encode(data);
  return new Response(new ReadableStream({ start(controller) { for (let i = 0; i < bytes.length; i += 7) controller.enqueue(bytes.slice(i, i + 7)); controller.close(); } }));
}
const settings = { apiKey: "test-only-key", model: "test/model" };
const args = { ...settings, messages: [{ role: "user", content: "Quelle" }] };

test("splits long text without losing content or damaging Unicode", () => {
  const text = "a".repeat(11999) + "😀" + "b".repeat(24000);
  const chunks = splitText(text);
  assert.equal(chunks.join(""), text);
  assert(chunks.every((chunk) => chunk.length <= 12000));
  assert(chunks.every((chunk) => !/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/.test(chunk)));
});
test("streams split UTF-8 and CRLF events and sends selected model without leaking key into prompt", async (t) => {
  let body;
  t.mock.method(globalThis, "fetch", async (_url, options) => { body = JSON.parse(options.body); assert.equal(options.headers.Authorization, "Bearer test-only-key"); return stream("Überblick für große Städte 😀"); });
  const deltas = [];
  assert.equal(await complete({ ...args, onDelta: (text) => deltas.push(text) }), "Überblick für große Städte 😀");
  assert.equal(body.model, "test/model");
  assert.equal(body.stream, true);
  assert(!JSON.stringify(body).includes(settings.apiKey));
  assert.equal(deltas.at(-1), "Überblick für große Städte 😀");
});
test("provides actionable HTTP errors and never displays arbitrary response bodies", async (t) => {
  for (const [code, pattern] of [[401, /API-Key/], [402, /Guthaben/], [429, /Zu viele/], [404, /Modell-ID/], [503, /HTTP 503/]]) {
    t.mock.method(globalThis, "fetch", async () => new Response("sensitive server data", { status: code }));
    await assert.rejects(complete(args), pattern);
    t.mock.restoreAll();
  }
});
test("rejects missing keys, truncated answers, empty replies and broken streams", async (t) => {
  await assert.rejects(complete({ ...args, apiKey: "" }), /API-Key/);
  t.mock.method(globalThis, "fetch", async () => stream("Unvollständig", "length"));
  await assert.rejects(complete(args), /abgeschnitten/);
  t.mock.restoreAll();
  t.mock.method(globalThis, "fetch", async () => stream(""));
  await assert.rejects(complete(args), /keinen Zusammenfassungstext/);
  t.mock.restoreAll();
  t.mock.method(globalThis, "fetch", async () => new Response('data: {"choices":[{"delta":{"content":"Teil"}}]}\n\n'));
  await assert.rejects(complete(args), /unterbrochen/);
});
test("handles mid-stream provider errors", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response('data: {"error":{"message":"secret"}}\n\n'));
  await assert.rejects(complete(args), /während der Verarbeitung/);
});
test("long pages summarize every section and synthesize notes in a separate request", async (t) => {
  const requests = [];
  t.mock.method(globalThis, "fetch", async (_url, options) => { const body = JSON.parse(options.body); requests.push(body); return stream(requests.length < 4 ? `Notiz ${requests.length}` : "# Überblick\n\nGesamtsynthese"); });
  const result = await summarizePage({ title: "Lange Quelle", text: "x".repeat(25000) }, settings);
  assert.equal(requests.length, 4);
  assert(requests[0].messages[1].content.endsWith("x".repeat(12000)));
  assert(requests[2].messages[1].content.endsWith("x".repeat(1000)));
  assert.match(requests[3].messages[1].content, /Notiz 1[\s\S]*Notiz 2[\s\S]*Notiz 3/);
  assert.match(requests[3].messages[0].content, /keine.*Anweisungen|niemals als Anweisungen/);
  assert.match(result, /Gesamtsynthese/);
});
test("aborting stops further section requests", async (t) => {
  const controller = new AbortController();
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => { calls++; controller.abort(); throw new DOMException("abort", "AbortError"); });
  await assert.rejects(summarizePage({ title: "Quelle", text: "x".repeat(25000) }, settings, { signal: controller.signal }), { name: "AbortError" });
  assert.equal(calls, 1);
});

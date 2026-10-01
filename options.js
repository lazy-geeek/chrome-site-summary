import { DEFAULT_MODEL, loadSettings, saveSettings } from "./settings.js";
import { complete } from "./openrouter.js";

const key = document.querySelector("#api-key");
const model = document.querySelector("#model");
const status = document.querySelector("#status");
const error = document.querySelector("#error");
const test = document.querySelector("#test");
function showError(message) { error.textContent = message; error.hidden = false; }
loadSettings().then((values) => { key.value = values.apiKey; model.value = values.model; }).catch(() => showError("Die Einstellungen konnten nicht geladen werden. Bitte öffne die Seite erneut."));
document.querySelector("#toggle-key").addEventListener("click", (event) => {
  const visible = key.type === "password";
  key.type = visible ? "text" : "password";
  event.currentTarget.textContent = visible ? "Verbergen" : "Anzeigen";
  event.currentTarget.setAttribute("aria-pressed", String(visible));
});
document.querySelector("#form").addEventListener("submit", async (event) => {
  event.preventDefault(); error.hidden = true; status.textContent = "";
  try { await saveSettings(key.value, model.value); model.value = model.value.trim() || DEFAULT_MODEL; status.textContent = key.value.trim() ? "Einstellungen gespeichert." : "Einstellungen gespeichert. Bitte hinterlege vor der Zusammenfassung einen API-Key."; }
  catch { showError("Die Einstellungen konnten nicht gespeichert werden."); }
});
test.addEventListener("click", async () => {
  test.disabled = true; error.hidden = true; status.textContent = "Verbindung und Modell werden geprüft …";
  try {
    await complete({ apiKey: key.value.trim(), model: model.value.trim() || DEFAULT_MODEL, maxTokens: 64, messages: [{ role: "user", content: "Antworte nur mit dem Wort OK." }] });
    status.textContent = "Verbindung erfolgreich. API-Key und Modell funktionieren. Speichere deine Einstellungen, falls du sie geändert hast.";
  } catch (failure) { status.textContent = ""; showError(failure.message); }
  finally { test.disabled = false; }
});

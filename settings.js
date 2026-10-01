export const DEFAULT_MODEL = "anthropic/claude-sonnet-4.5";

export async function loadSettings() {
  await chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
  const values = await chrome.storage.local.get(["apiKey", "model"]);
  return { apiKey: values.apiKey?.trim() || "", model: values.model?.trim() || DEFAULT_MODEL };
}

export async function saveSettings(apiKey, model) {
  await chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
  await chrome.storage.local.set({ apiKey: apiKey.trim(), model: model.trim() || DEFAULT_MODEL });
}

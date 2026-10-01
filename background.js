async function configure() {
  await chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
}

configure().catch(console.error);
chrome.runtime.onInstalled.addListener(() => configure().catch(console.error));
chrome.runtime.onStartup.addListener(() => configure().catch(console.error));

chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.session.remove(`summary:${tabId}`).catch(console.error);
});
chrome.tabs.onUpdated.addListener((tabId, change) => {
  if (change.status === "loading" || change.url) {
    chrome.storage.session.remove(`summary:${tabId}`).catch(console.error);
  }
});

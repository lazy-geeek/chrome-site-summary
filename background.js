async function configure() {
  await chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
}

// An explicit action invocation grants activeTab and also refreshes an already
// open panel. Call open before any await so Chrome retains the user gesture.
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ windowId: tab.windowId }).then(() => {
    return chrome.runtime.sendMessage({ type: "PAGE_ACCESS_GRANTED", tabId: tab.id, windowId: tab.windowId }).catch(() => {});
  }).catch(console.error);
});

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

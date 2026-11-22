const MENU_ID = "veilbrief-audit-selection";
const MENU_TITLE = "Audit Privately with VeilBrief";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create(
      {
        id: MENU_ID,
        title: MENU_TITLE,
        contexts: ["selection"]
      },
      () => {
        if (chrome.runtime.lastError) {
          console.error(
            "Unable to register VeilBrief context menu.",
            chrome.runtime.lastError
          );
        }
      }
    );
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  const tabId = tab?.id;
  if (info.menuItemId !== MENU_ID || !info.selectionText || tabId === undefined) {
    return;
  }

  void Promise.all([
    chrome.sidePanel.open({ tabId }),
    chrome.storage.local.set({
      pendingSelectionText: info.selectionText,
      pendingSelectionAt: Date.now()
    })
  ]).catch((error: unknown) => {
    console.error("Unable to open the VeilBrief side panel.", error);
  });
});

export {};

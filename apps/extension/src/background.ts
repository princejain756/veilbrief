const MENU_ID = "veilbrief-audit-selection";
const MENU_TITLE = "Audit Privately with VeilBrief";

chrome.runtime.onInstalled.addListener(() => {
  void chrome.sidePanel.setPanelBehavior?.({ openPanelOnActionClick: true });
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create(
      {
        id: MENU_ID,
        title: MENU_TITLE,
        contexts: ["selection"],
      },
      () => {
        if (chrome.runtime.lastError) {
          console.error(
            "Unable to register VeilBrief context menu.",
            chrome.runtime.lastError,
          );
        }
      },
    );
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  const tabId = tab?.id;
  if (
    info.menuItemId !== MENU_ID ||
    !info.selectionText ||
    tabId === undefined
  ) {
    return;
  }

  // Open sidePanel immediately in the user gesture, and stage raw text in RAM-only session storage.
  void chrome.sidePanel.open({ tabId }).catch((error: unknown) => {
    console.error("Unable to open the VeilBrief side panel.", error);
  });

  void chrome.storage.session
    .set({
      pendingSelection: {
        text: info.selectionText,
        tabId,
        nonce: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      },
    })
    .catch((error: unknown) => {
      console.error("Unable to stage selection in session RAM.", error);
    });
});

export {};

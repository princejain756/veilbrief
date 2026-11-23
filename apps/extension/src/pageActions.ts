export interface PageActionResult {
  ok: boolean;
  message: string;
}

async function activeTabId(): Promise<number | null> {
  const active = await chrome.tabs.query({ active: true, currentWindow: true });
  if (active[0]?.id !== undefined && !active[0].url?.startsWith("chrome-extension://")) {
    return active[0].id;
  }
  const all = await chrome.tabs.query({ lastFocusedWindow: true });
  const webTab = all.find(
    (t) =>
      t.id !== undefined &&
      t.url &&
      (t.url.startsWith("https://") || t.url.startsWith("http://")),
  );
  if (webTab?.id !== undefined) return webTab.id;

  const anyWeb = await chrome.tabs.query({});
  const fallback = anyWeb.find(
    (t) =>
      t.id !== undefined &&
      t.url &&
      (t.url.startsWith("https://veilbrief.prince.sh") || t.url.startsWith("http://localhost")),
  );
  return fallback?.id ?? null;
}

export async function captureActiveTabSelection(): Promise<string | null> {
  const tabId = await activeTabId();
  if (tabId === null) return null;

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const selected = window.getSelection()?.toString().trim();
        if (selected) return selected;

        const editor = document.querySelector<HTMLTextAreaElement>(
          "#portal-contract-editor, textarea",
        );
        if (editor?.value?.trim()) {
          return editor.value.trim();
        }

        const blocks = Array.from(
          document.querySelectorAll<HTMLElement>("[data-veilbrief-clause]"),
        )
          .map((el) => el.innerText.trim())
          .filter(Boolean);
        if (blocks.length > 0) {
          return blocks.join("\n\n");
        }
        return null;
      },
    });
    const value = results[0]?.result;
    return typeof value === "string" && value.trim() ? value.trim() : null;
  } catch {
    return null;
  }
}

export async function highlightClauseOnActiveTab(
  snippet: string,
): Promise<PageActionResult> {
  const clean = snippet.trim();
  if (!clean) {
    return { ok: false, message: "No source clause snippet to locate." };
  }
  const tabId = await activeTabId();
  if (tabId === null) {
    return { ok: false, message: "No active browser tab found." };
  }

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      args: [clean],
      func: (targetText: string) => {
        const normalizedTarget = targetText.replace(/\s+/g, " ").toLowerCase();

        const candidates = Array.from(
          document.querySelectorAll<HTMLElement>(
            "[data-veilbrief-clause], p, div, section, article, li",
          ),
        );
        for (const el of candidates) {
          if (el.children.length > 0 && !el.hasAttribute("data-veilbrief-clause")) {
            continue;
          }
          const normalized = el.innerText.replace(/\s+/g, " ").toLowerCase();
          if (normalized.includes(normalizedTarget)) {
            el.scrollIntoView({ behavior: "smooth", block: "center" });
            el.style.outline = "2px solid #10b981";
            el.style.backgroundColor = "rgba(16, 185, 129, 0.12)";
            return { ok: true, message: "Highlighted matching clause on page." };
          }
        }

        const textarea = document.querySelector<HTMLTextAreaElement>(
          "#portal-contract-editor, textarea",
        );
        if (textarea) {
          const idx = textarea.value
            .toLowerCase()
            .indexOf(targetText.toLowerCase());
          if (idx >= 0) {
            textarea.focus();
            textarea.setSelectionRange(idx, idx + targetText.length);
            textarea.scrollIntoView({ behavior: "smooth", block: "center" });
            return { ok: true, message: "Selected clause inside page editor." };
          }
        }

        return {
          ok: false,
          message: "Clause text not found verbatim on current page.",
        };
      },
    });
    return (
      results[0]?.result ?? {
        ok: false,
        message: "Unable to inspect active page DOM.",
      }
    );
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "Host permission unavailable on this tab.",
    };
  }
}

export async function applyRedlineOnActiveTab(
  originalText: string,
  replacementText: string,
): Promise<PageActionResult> {
  const target = originalText.trim();
  const replacement = replacementText.trim();
  if (!target || !replacement) {
    return {
      ok: false,
      message: "Missing original clause snippet or replacement text.",
    };
  }
  const tabId = await activeTabId();
  if (tabId === null) {
    return { ok: false, message: "No active browser tab found." };
  }

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      args: [target, replacement],
      func: (orig: string, next: string) => {
        const escapeRegex = (v: string) =>
          v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const wsPattern = new RegExp(
          orig
            .split(/\s+/)
            .map((part) => escapeRegex(part))
            .join("\\s+"),
          "i",
        );

        let updatedCount = 0;

        const textareas = Array.from(
          document.querySelectorAll<HTMLTextAreaElement>("textarea"),
        );
        for (const textarea of textareas) {
          if (textarea.value.includes(orig) || wsPattern.test(textarea.value)) {
            const newValue = textarea.value.includes(orig)
              ? textarea.value.replace(orig, next)
              : textarea.value.replace(wsPattern, next);
            const setter = Object.getOwnPropertyDescriptor(
              HTMLTextAreaElement.prototype,
              "value",
            )?.set;
            if (setter) {
              setter.call(textarea, newValue);
            } else {
              textarea.value = newValue;
            }
            textarea.dispatchEvent(new Event("input", { bubbles: true }));
            textarea.dispatchEvent(new Event("change", { bubbles: true }));
            updatedCount += 1;
          }
        }

        const blocks = Array.from(
          document.querySelectorAll<HTMLElement>("[data-veilbrief-clause]"),
        );
        for (const block of blocks) {
          const current = block.innerText;
          if (current.includes(orig) || wsPattern.test(current)) {
            block.innerText = current.includes(orig)
              ? current.replace(orig, next)
              : current.replace(wsPattern, next);
            block.style.outline = "2px solid #10b981";
            block.style.backgroundColor = "rgba(16, 185, 129, 0.12)";
            block.scrollIntoView({ behavior: "smooth", block: "center" });
            updatedCount += 1;
          } else if (current.includes(next)) {
            block.style.outline = "2px solid #10b981";
            block.style.backgroundColor = "rgba(16, 185, 129, 0.12)";
            block.scrollIntoView({ behavior: "smooth", block: "center" });
          }
        }

        if (updatedCount > 0) {
          return {
            ok: true,
            message: "Applied rehydrated counter-clause inline on the page.",
          };
        }
        return {
          ok: false,
          message: "Could not locate matching clause on page. Copy instead.",
        };
      },
    });
    return (
      results[0]?.result ?? {
        ok: false,
        message: "Unable to modify active tab DOM.",
      }
    );
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "Scripting failed on active tab.",
    };
  }
}

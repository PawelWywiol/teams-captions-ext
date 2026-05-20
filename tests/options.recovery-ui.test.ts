import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JSDOM } from "jsdom";
import type { PluginSettings } from "../src/shared/types.js";

const baseSettings: PluginSettings = {
  apiBaseUrl: "https://proxy.example.test",
  bearerToken: "",
  provider: "copilot",
  customTitleDefault: "Weekly sync",
  extendedPromptDefault: "summarize action items",
  participantAliases: { Alice: "PM" },
};

const optionsHtml = `<!doctype html>
<html lang="en">
  <body>
    <input id="apiBaseUrl" placeholder="API Base URL" />
    <input id="bearerToken" type="password" placeholder="Bearer Token" />
    <select id="provider">
      <option value="copilot">copilot</option>
      <option value="claude">claude</option>
      <option value="gemini">gemini</option>
    </select>
    <input id="customTitleDefault" placeholder="Custom Title Default" />
    <textarea id="extendedPromptDefault" placeholder="Extended Prompt Default"></textarea>
    <textarea id="participantAliases" placeholder="Original = Alias"></textarea>
    <button id="save">Save</button>
    <div id="save-status"></div>
  </body>
</html>`;

type StorageModule = typeof import("../src/shared/storage.js");

function setupDom(): void {
  const dom = new JSDOM(optionsHtml, { url: "https://example.test/options.html" });
  vi.stubGlobal("window", dom.window);
  vi.stubGlobal("document", dom.window.document);
  vi.stubGlobal("Event", dom.window.Event);
  vi.stubGlobal("CustomEvent", dom.window.CustomEvent);
  vi.stubGlobal("HTMLElement", dom.window.HTMLElement);
  vi.stubGlobal("HTMLInputElement", dom.window.HTMLInputElement);
  vi.stubGlobal("HTMLTextAreaElement", dom.window.HTMLTextAreaElement);
  vi.stubGlobal("HTMLSelectElement", dom.window.HTMLSelectElement);
  vi.stubGlobal("HTMLButtonElement", dom.window.HTMLButtonElement);
}

function dispatchDomReady(): void {
  document.dispatchEvent(new window.Event("DOMContentLoaded"));
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("options recovery UI", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    setupDom();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("disables save, renders non-secret settings, and re-enables only after token re-entry on secure-load failure", async () => {
    const saveSettings = vi.fn(async () => undefined);
    vi.doMock(
      "../src/shared/storage.js",
      (): Partial<StorageModule> => ({
        loadSettings: vi.fn(async () => {
          throw new Error(
            "Secure session storage is unavailable; saved bearer token could not be loaded",
          );
        }),
        loadPersistedSettings: vi.fn(async () => baseSettings),
        saveSettings,
      }),
    );

    await import("../src/options/index.js");
    dispatchDomReady();
    await flush();

    const apiBaseUrl = document.getElementById("apiBaseUrl") as HTMLInputElement;
    const bearerToken = document.getElementById("bearerToken") as HTMLInputElement;
    const participantAliases = document.getElementById("participantAliases") as HTMLTextAreaElement;
    const saveButton = document.getElementById("save") as HTMLButtonElement;
    const saveStatus = document.getElementById("save-status") as HTMLDivElement;

    expect(apiBaseUrl.value).toBe("https://proxy.example.test");
    expect(participantAliases.value).toContain("Alice = PM");
    expect(bearerToken.value).toBe("");
    expect(saveButton.disabled).toBe(true);
    expect(saveStatus.textContent).toContain("Secure session storage is unavailable");

    bearerToken.value = "fresh-token";
    bearerToken.dispatchEvent(new window.Event("input", { bubbles: true }));
    expect(saveButton.disabled).toBe(false);
    expect(saveStatus.textContent).toBe("Enter token again to re-enable save");

    saveButton.click();
    await flush();

    expect(saveSettings).toHaveBeenCalledWith({
      ...baseSettings,
      bearerToken: "fresh-token",
    });
    expect(saveStatus.textContent).toBe("Saved");
  });

  it("keeps save blocked and does not overwrite settings defaults when both secure and persisted loads fail", async () => {
    const saveSettings = vi.fn(async () => undefined);
    vi.doMock(
      "../src/shared/storage.js",
      (): Partial<StorageModule> => ({
        loadSettings: vi.fn(async () => {
          throw new Error(
            "Secure session storage is unavailable; saved bearer token could not be loaded",
          );
        }),
        loadPersistedSettings: vi.fn(async () => {
          throw new Error(
            "Persistent settings storage is unavailable; settings could not be loaded",
          );
        }),
        saveSettings,
      }),
    );

    await import("../src/options/index.js");
    dispatchDomReady();
    await flush();

    const apiBaseUrl = document.getElementById("apiBaseUrl") as HTMLInputElement;
    const bearerToken = document.getElementById("bearerToken") as HTMLInputElement;
    const saveButton = document.getElementById("save") as HTMLButtonElement;
    const saveStatus = document.getElementById("save-status") as HTMLDivElement;

    expect(apiBaseUrl.value).toBe("");
    expect(saveButton.disabled).toBe(true);
    expect(saveStatus.textContent).toContain("Secure session storage is unavailable");

    bearerToken.value = "fresh-token";
    bearerToken.dispatchEvent(new window.Event("input", { bubbles: true }));
    expect(saveButton.disabled).toBe(true);
    expect(saveSettings).not.toHaveBeenCalled();
    expect(saveStatus.textContent).toBe("Reload after settings storage recovers before saving");
  });
});

// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/preact";
import type { PluginSettings } from "../src/shared/types.js";

const baseSettings: PluginSettings = {
  apiBaseUrl: "https://proxy.example.test",
  bearerToken: "",
  provider: "copilot",
  customTitleDefault: "Weekly sync",
  extendedPromptDefault: "summarize action items",
  participantAliases: { Alice: "PM" },
};

type StorageModule = typeof import("../src/shared/storage.js");

describe("options recovery UI", () => {
  let permissionsRequest: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();
    permissionsRequest = vi.fn(async () => true);
    vi.stubGlobal("browser", {
      permissions: { contains: vi.fn(async () => true), request: permissionsRequest },
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("disables save, renders non-secret settings, and re-enables only after token re-entry on secure-load failure", async () => {
    const saveSettings = vi.fn(async () => undefined);
    vi.doMock(
      "../src/shared/storage.js",
      (): Partial<StorageModule> => ({
        defaultSettings: { ...baseSettings, bearerToken: "", participantAliases: {} },
        loadSettings: vi.fn(async () => {
          throw new Error(
            "Secure session storage is unavailable; saved bearer token could not be loaded",
          );
        }),
        loadPersistedSettings: vi.fn(async () => baseSettings),
        saveSettings,
      }),
    );

    const { App } = await import("../src/ui/options/App.js");
    const { container } = render(<App />);

    await waitFor(() => {
      const apiBaseUrl = container.querySelector<HTMLInputElement>("#apiBaseUrl");
      expect(apiBaseUrl?.value).toBe("https://proxy.example.test");
    });

    const bearerToken = container.querySelector<HTMLInputElement>("#bearerToken");
    const aliases = container.querySelector<HTMLTextAreaElement>("#participantAliases");
    const saveButton = container.querySelector<HTMLButtonElement>("#save");
    const saveStatus = container.querySelector<HTMLDivElement>("#save-status");

    expect(aliases?.value).toContain("Alice = PM");
    expect(bearerToken?.value).toBe("");
    expect(saveButton?.disabled).toBe(true);
    expect(saveStatus?.textContent).toContain("Secure session storage is unavailable");

    fireEvent.input(bearerToken!, { target: { value: "fresh-token" } });
    await waitFor(() => expect(saveButton?.disabled).toBe(false));

    fireEvent.click(saveButton!);
    await waitFor(() => expect(saveSettings).toHaveBeenCalled());

    expect(saveSettings).toHaveBeenCalledWith({
      ...baseSettings,
      bearerToken: "fresh-token",
    });
    expect(permissionsRequest).toHaveBeenCalledWith({
      origins: ["https://proxy.example.test/*"],
    });
    expect(saveStatus?.textContent).toBe("Saved");
  });

  it("keeps save blocked and does not overwrite settings defaults when both secure and persisted loads fail", async () => {
    const saveSettings = vi.fn(async () => undefined);
    vi.doMock(
      "../src/shared/storage.js",
      (): Partial<StorageModule> => ({
        defaultSettings: {
          apiBaseUrl: "",
          bearerToken: "",
          provider: "copilot",
          customTitleDefault: "",
          extendedPromptDefault: "",
          participantAliases: {},
        },
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

    const { App } = await import("../src/ui/options/App.js");
    const { container } = render(<App />);

    await waitFor(() => {
      const saveStatus = container.querySelector<HTMLDivElement>("#save-status");
      expect(saveStatus?.textContent).toContain("Secure session storage is unavailable");
    });

    const apiBaseUrl = container.querySelector<HTMLInputElement>("#apiBaseUrl");
    const bearerToken = container.querySelector<HTMLInputElement>("#bearerToken");
    const saveButton = container.querySelector<HTMLButtonElement>("#save");
    const saveStatus = container.querySelector<HTMLDivElement>("#save-status");

    expect(apiBaseUrl?.value).toBe("");
    expect(saveButton?.disabled).toBe(true);

    fireEvent.input(bearerToken!, { target: { value: "fresh-token" } });
    await waitFor(() =>
      expect(saveStatus?.textContent).toBe("Reload after settings storage recovers before saving"),
    );

    expect(saveButton?.disabled).toBe(true);
    expect(saveSettings).not.toHaveBeenCalled();
  });
});

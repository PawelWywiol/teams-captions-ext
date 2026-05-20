import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  defaultSettings,
  loadSettings,
  saveSettings,
  type StorageBackend,
} from "../src/shared/storage.js";
import type { PluginSettings } from "../src/shared/types.js";

type BackendSnapshot = {
  localState: Record<string, unknown>;
  sessionState: Record<string, unknown>;
};

type TestStorageBackend = StorageBackend & {
  session: NonNullable<StorageBackend["session"]>;
  snapshot: () => BackendSnapshot;
};

function makeSettings(overrides: Partial<PluginSettings> = {}): PluginSettings {
  return {
    ...defaultSettings,
    apiBaseUrl: "https://proxy.example.test",
    bearerToken: "super-secret-token",
    provider: "copilot",
    ...overrides,
  };
}

function makeBackend(
  initialLocal: Record<string, unknown> = {},
  initialSession: Record<string, unknown> = {},
): TestStorageBackend {
  const localState = { ...initialLocal };
  const sessionState = { ...initialSession };

  return {
    local: {
      get: vi.fn(async (key: string) => ({ [key]: localState[key] })),
      set: vi.fn(async (value: Record<string, unknown>) => {
        Object.assign(localState, value);
      }),
    },
    session: {
      get: vi.fn(async (key: string) => ({ [key]: sessionState[key] })),
      set: vi.fn(async (value: Record<string, unknown>) => {
        Object.assign(sessionState, value);
      }),
    },
    snapshot: () => ({
      localState: structuredClone(localState),
      sessionState: structuredClone(sessionState),
    }),
  };
}

describe("settings storage policy", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("does not persist bearerToken plaintext into local storage", async () => {
    const backend = makeBackend();

    await saveSettings(makeSettings(), backend);

    expect(backend.local.set).toHaveBeenCalledTimes(1);
    expect(backend.session.set).toHaveBeenCalledTimes(1);

    const snapshot = backend.snapshot() as BackendSnapshot;
    expect(snapshot.localState).toEqual({
      pluginSettings: expect.objectContaining({
        apiBaseUrl: "https://proxy.example.test",
        bearerToken: "",
        bearerTokenStoredInSession: true,
      }),
    });
    expect(snapshot.sessionState).toEqual({
      pluginSessionSecrets: {
        bearerToken: "super-secret-token",
      },
    });
  });

  it("rehydrates bearerToken from session storage when loading settings", async () => {
    const backend = makeBackend(
      {
        pluginSettings: {
          apiBaseUrl: "https://proxy.example.test",
          bearerToken: "",
          bearerTokenStoredInSession: true,
          provider: "copilot",
          customTitleDefault: "Weekly sync",
          extendedPromptDefault: "summarize action items",
          participantAliases: { Alice: "PM" },
        },
      },
      {
        pluginSessionSecrets: {
          bearerToken: "ephemeral-token",
        },
      },
    );

    await expect(loadSettings(backend)).resolves.toEqual({
      apiBaseUrl: "https://proxy.example.test",
      bearerToken: "ephemeral-token",
      provider: "copilot",
      customTitleDefault: "Weekly sync",
      extendedPromptDefault: "summarize action items",
      participantAliases: { Alice: "PM" },
    });
  });

  it("migrates a legacy local plaintext bearerToken into session storage and scrubs local state", async () => {
    const backend = makeBackend({
      pluginSettings: {
        apiBaseUrl: "https://proxy.example.test",
        bearerToken: "legacy-local-token",
        provider: "copilot",
        customTitleDefault: "Weekly sync",
        extendedPromptDefault: "summarize action items",
        participantAliases: { Alice: "PM" },
      },
    });

    await expect(loadSettings(backend)).resolves.toEqual({
      apiBaseUrl: "https://proxy.example.test",
      bearerToken: "legacy-local-token",
      provider: "copilot",
      customTitleDefault: "Weekly sync",
      extendedPromptDefault: "summarize action items",
      participantAliases: { Alice: "PM" },
    });

    expect(backend.session.set).toHaveBeenCalledWith({
      pluginSessionSecrets: {
        bearerToken: "legacy-local-token",
      },
    });
    expect(backend.local.set).toHaveBeenCalledWith({
      pluginSettings: {
        apiBaseUrl: "https://proxy.example.test",
        bearerToken: "",
        bearerTokenStoredInSession: true,
        provider: "copilot",
        customTitleDefault: "Weekly sync",
        extendedPromptDefault: "summarize action items",
        participantAliases: { Alice: "PM" },
      },
    });
  });

  it("fails closed when a legacy local plaintext bearerToken cannot be migrated into secure session storage", async () => {
    const backend = makeBackend({
      pluginSettings: {
        apiBaseUrl: "https://proxy.example.test",
        bearerToken: "legacy-local-token",
        provider: "copilot",
        customTitleDefault: "Weekly sync",
        extendedPromptDefault: "summarize action items",
        participantAliases: { Alice: "PM" },
      },
    });

    backend.session.get = vi.fn(async () => {
      throw new Error("session unavailable");
    });
    backend.session.set = vi.fn(async () => {
      throw new Error("session unavailable");
    });

    await expect(loadSettings(backend)).rejects.toThrow(
      "Legacy bearer token remains in insecure storage; secure migration is required",
    );
    expect(backend.local.set).not.toHaveBeenCalled();
  });

  it("fails loudly when clearing bearerToken but secure session cleanup is unavailable", async () => {
    const backend = makeBackend({
      pluginSettings: {
        apiBaseUrl: "https://proxy.example.test",
        bearerToken: "",
        bearerTokenStoredInSession: true,
        provider: "copilot",
        customTitleDefault: "Weekly sync",
        extendedPromptDefault: "summarize action items",
        participantAliases: { Alice: "PM" },
      },
    });

    backend.session.set = vi.fn(async () => {
      throw new Error("session unavailable");
    });

    await expect(saveSettings(makeSettings({ bearerToken: "" }), backend)).rejects.toThrow(
      "Secure session storage is unavailable; bearer token was not cleared",
    );
    expect(backend.local.set).not.toHaveBeenCalled();
  });

  it("fails loudly instead of silently dropping a non-empty token when session storage is unavailable", async () => {
    const backend = makeBackend();

    backend.session.set = vi.fn(async () => {
      throw new Error("session unavailable");
    });

    await expect(saveSettings(makeSettings(), backend)).rejects.toThrow(
      "Secure session storage is unavailable; bearer token was not saved",
    );
    expect(backend.local.set).not.toHaveBeenCalled();
  });

  it("clears stale session token state when saving an empty bearerToken", async () => {
    const backend = makeBackend(
      {
        pluginSettings: {
          apiBaseUrl: "https://proxy.example.test",
          bearerToken: "",
          bearerTokenStoredInSession: true,
          provider: "copilot",
          customTitleDefault: "Weekly sync",
          extendedPromptDefault: "summarize action items",
          participantAliases: { Alice: "PM" },
        },
      },
      { pluginSessionSecrets: { bearerToken: "stale-token" } },
    );

    await saveSettings(makeSettings({ bearerToken: "" }), backend);

    expect(backend.session.set).toHaveBeenCalledWith({
      pluginSessionSecrets: {
        bearerToken: "",
      },
    });
    expect(backend.local.set).toHaveBeenCalledWith({
      pluginSettings: expect.objectContaining({
        bearerToken: "",
        bearerTokenStoredInSession: false,
      }),
    });
  });

  it("still saves non-secret settings when no secure session backend is present and no session token is tracked", async () => {
    const backend = makeBackend({
      pluginSettings: {
        apiBaseUrl: "https://proxy.example.test",
        bearerToken: "",
        bearerTokenStoredInSession: false,
        provider: "copilot",
        customTitleDefault: "Weekly sync",
        extendedPromptDefault: "summarize action items",
        participantAliases: { Alice: "PM" },
      },
    });

    const backendWithoutSession: StorageBackend = {
      local: backend.local,
    };

    await expect(
      saveSettings(makeSettings({ bearerToken: "" }), backendWithoutSession),
    ).resolves.toBeUndefined();
    expect(backend.local.set).toHaveBeenCalledTimes(1);
  });

  it("throws explicit load error when settings expect a session token but session storage cannot be read", async () => {
    const backend = makeBackend({
      pluginSettings: {
        apiBaseUrl: "https://proxy.example.test",
        bearerToken: "",
        bearerTokenStoredInSession: true,
        provider: "copilot",
        customTitleDefault: "Weekly sync",
        extendedPromptDefault: "summarize action items",
        participantAliases: { Alice: "PM" },
      },
    });

    backend.session.get = vi.fn(async () => {
      throw new Error("session unavailable");
    });

    await expect(loadSettings(backend)).rejects.toThrow(
      "Secure session storage is unavailable; saved bearer token could not be loaded",
    );
  });

  it("can still load non-secret persisted settings without session storage for recovery UI", async () => {
    const backend = makeBackend({
      pluginSettings: {
        apiBaseUrl: "https://proxy.example.test",
        bearerToken: "",
        bearerTokenStoredInSession: true,
        provider: "copilot",
        customTitleDefault: "Weekly sync",
        extendedPromptDefault: "summarize action items",
        participantAliases: { Alice: "PM" },
      },
    });

    const { loadPersistedSettings } = await import("../src/shared/storage.js");

    await expect(loadPersistedSettings(backend)).resolves.toEqual({
      apiBaseUrl: "https://proxy.example.test",
      bearerToken: "",
      provider: "copilot",
      customTitleDefault: "Weekly sync",
      extendedPromptDefault: "summarize action items",
      participantAliases: { Alice: "PM" },
    });
  });

  it("fails closed when settings cannot be read from persistent storage", async () => {
    const backend = makeBackend();

    backend.local.get = vi.fn(async () => {
      throw new Error("local unavailable");
    });

    await expect(loadSettings(backend)).rejects.toThrow(
      "Persistent settings storage is unavailable; settings could not be loaded",
    );
  });
});

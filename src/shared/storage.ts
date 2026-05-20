import type { PluginSettings } from "./types.js";

const SETTINGS_KEY = "pluginSettings";
const SESSION_SECRETS_KEY = "pluginSessionSecrets";

type StorageArea = {
  get(key: string): Promise<Record<string, unknown>>;
  set(value: Record<string, unknown>): Promise<void>;
};

export type StorageBackend = {
  local: StorageArea;
  session?: StorageArea;
  snapshot?: () => unknown;
};

type SessionSecrets = {
  bearerToken: string;
};

type PersistedPluginSettings = PluginSettings & {
  bearerTokenStoredInSession?: boolean;
};

export const defaultSettings: PluginSettings = {
  apiBaseUrl: "",
  bearerToken: "",
  provider: "copilot",
  customTitleDefault: "",
  extendedPromptDefault: "",
  participantAliases: {},
};

function getStorageBackend(): StorageBackend {
  return {
    local: browser.storage.local,
    session: browser.storage.session,
  };
}

function sanitizePersistentSettings(settings: PluginSettings): PersistedPluginSettings {
  return {
    ...settings,
    bearerToken: "",
    bearerTokenStoredInSession: Boolean(settings.bearerToken.trim()),
  };
}

function toPluginSettings(parsed: Partial<PersistedPluginSettings> | undefined): PluginSettings {
  const base = parsed
    ? {
        ...defaultSettings,
        ...parsed,
        participantAliases: parsed.participantAliases ?? {},
      }
    : { ...defaultSettings };

  const {
    bearerTokenStoredInSession: _ignoredBearerTokenStoredInSession,
    ...withoutInternalMarker
  } = base as PersistedPluginSettings;

  return {
    ...withoutInternalMarker,
    bearerToken: "",
  };
}

function mergeSettings(
  parsed: Partial<PersistedPluginSettings> | undefined,
  bearerToken: string,
): PluginSettings {
  return {
    ...toPluginSettings(parsed),
    bearerToken,
  };
}

async function readPersistentSettings(
  local: StorageArea,
): Promise<Partial<PersistedPluginSettings> | undefined> {
  try {
    const localResult = await local.get(SETTINGS_KEY);
    return localResult[SETTINGS_KEY] as Partial<PersistedPluginSettings> | undefined;
  } catch {
    throw new Error("Persistent settings storage is unavailable; settings could not be loaded");
  }
}

export async function loadPersistedSettings(
  backend: StorageBackend = getStorageBackend(),
): Promise<PluginSettings> {
  const parsed = await readPersistentSettings(backend.local);
  return toPluginSettings(parsed);
}

async function readSessionBearerToken(
  parsed: Partial<PersistedPluginSettings> | undefined,
  session?: StorageArea,
): Promise<string> {
  const expectsSessionToken = Boolean(parsed?.bearerTokenStoredInSession);
  if (!expectsSessionToken) {
    return "";
  }

  if (!session) {
    throw new Error(
      "Secure session storage is unavailable; saved bearer token could not be loaded",
    );
  }

  try {
    const sessionResult = await session.get(SESSION_SECRETS_KEY);
    const secrets = sessionResult[SESSION_SECRETS_KEY] as Partial<SessionSecrets> | undefined;
    const bearerToken = secrets?.bearerToken?.trim() ?? "";

    if (!bearerToken) {
      throw new Error("missing session token");
    }

    return bearerToken;
  } catch {
    throw new Error(
      "Secure session storage is unavailable; saved bearer token could not be loaded",
    );
  }
}

async function migrateLegacyBearerToken(
  parsed: Partial<PersistedPluginSettings> | undefined,
  backend: StorageBackend,
): Promise<string | undefined> {
  const legacyBearerToken = parsed?.bearerToken?.trim();
  if (!legacyBearerToken) return undefined;
  if (!backend.session) {
    throw new Error(
      "Legacy bearer token remains in insecure storage; secure migration is required",
    );
  }

  try {
    await backend.session.set({
      [SESSION_SECRETS_KEY]: {
        bearerToken: legacyBearerToken,
      },
    });
  } catch {
    throw new Error(
      "Legacy bearer token remains in insecure storage; secure migration is required",
    );
  }

  try {
    await backend.local.set({
      [SETTINGS_KEY]: sanitizePersistentSettings({
        ...defaultSettings,
        ...parsed,
        bearerToken: legacyBearerToken,
        participantAliases: parsed?.participantAliases ?? {},
      }),
    });
  } catch {
    throw new Error(
      "Legacy bearer token remains in insecure storage; secure migration is required",
    );
  }

  return legacyBearerToken;
}

export async function loadSettings(
  backend: StorageBackend = getStorageBackend(),
): Promise<PluginSettings> {
  const parsed = await readPersistentSettings(backend.local);
  const legacyBearerToken = await migrateLegacyBearerToken(parsed, backend);

  if (legacyBearerToken) {
    return mergeSettings(parsed, legacyBearerToken);
  }

  const bearerToken = await readSessionBearerToken(parsed, backend.session);
  return mergeSettings(parsed, bearerToken);
}

export async function saveSettings(
  settings: PluginSettings,
  backend: StorageBackend = getStorageBackend(),
): Promise<void> {
  const bearerToken = settings.bearerToken.trim();
  const persistedSettings = await readPersistentSettings(backend.local);
  const trackedSessionToken = Boolean(persistedSettings?.bearerTokenStoredInSession);

  if (bearerToken) {
    if (!backend.session) {
      throw new Error("Secure session storage is unavailable; bearer token was not saved");
    }

    try {
      await backend.session.set({
        [SESSION_SECRETS_KEY]: {
          bearerToken,
        },
      });
    } catch {
      throw new Error("Secure session storage is unavailable; bearer token was not saved");
    }
  } else if (trackedSessionToken) {
    if (!backend.session) {
      throw new Error("Secure session storage is unavailable; bearer token was not cleared");
    }

    try {
      await backend.session.set({
        [SESSION_SECRETS_KEY]: {
          bearerToken: "",
        },
      });
    } catch {
      throw new Error("Secure session storage is unavailable; bearer token was not cleared");
    }
  }

  await backend.local.set({
    [SETTINGS_KEY]: sanitizePersistentSettings({
      ...settings,
      bearerToken,
    }),
  });
}

import type { PluginSettings } from "./types.js";

const SETTINGS_KEY = "pluginSettings";

export const defaultSettings: PluginSettings = {
  apiBaseUrl: "",
  bearerToken: "",
  provider: "copilot",
  customTitleDefault: "",
  extendedPromptDefault: "",
  participantAliases: {},
};

export async function loadSettings(): Promise<PluginSettings> {
  try {
    const result = await browser.storage.local.get(SETTINGS_KEY);
    const parsed = result[SETTINGS_KEY] as Partial<PluginSettings> | undefined;

    if (!parsed) return defaultSettings;

    return {
      ...defaultSettings,
      ...parsed,
      participantAliases: parsed.participantAliases ?? {},
    };
  } catch {
    return defaultSettings;
  }
}

export async function saveSettings(settings: PluginSettings): Promise<void> {
  await browser.storage.local.set({
    [SETTINGS_KEY]: settings,
  });
}

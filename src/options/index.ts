import { loadPersistedSettings, loadSettings, saveSettings } from "../shared/storage.js";
import type { PluginSettings, ProviderId } from "../shared/types.js";
import { validateSettings } from "./schema.js";

function ensureInput(id: string): HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing element: ${id}`);
  return element as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
}

function ensureButton(id: string): HTMLButtonElement {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing button: ${id}`);
  return element as HTMLButtonElement;
}

function parseAliases(raw: string): Record<string, string> {
  const result: Record<string, string> = {};

  for (const line of raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)) {
    const [original, alias] = line.split("=").map((part) => part.trim());
    if (original && alias) result[original] = alias;
  }

  return result;
}

function formatAliases(aliases: Record<string, string>): string {
  return Object.entries(aliases)
    .map(([original, alias]) => `${original} = ${alias}`)
    .join("\n");
}

function readForm(): PluginSettings {
  return {
    apiBaseUrl: ensureInput("apiBaseUrl").value.trim(),
    bearerToken: ensureInput("bearerToken").value.trim(),
    provider: ensureInput("provider").value as ProviderId,
    customTitleDefault: ensureInput("customTitleDefault").value.trim(),
    extendedPromptDefault: ensureInput("extendedPromptDefault").value.trim(),
    participantAliases: parseAliases(ensureInput("participantAliases").value),
  };
}

function render(settings: PluginSettings): void {
  ensureInput("apiBaseUrl").value = settings.apiBaseUrl;
  ensureInput("bearerToken").value = settings.bearerToken;
  ensureInput("provider").value = settings.provider;
  ensureInput("customTitleDefault").value = settings.customTitleDefault;
  ensureInput("extendedPromptDefault").value = settings.extendedPromptDefault;
  ensureInput("participantAliases").value = formatAliases(settings.participantAliases);
}

document.addEventListener("DOMContentLoaded", async () => {
  const saveStatus = document.getElementById("save-status");
  if (!saveStatus) throw new Error("Missing save-status");

  const saveButton = ensureButton("save");
  let secureLoadFailed = false;
  let recoveryDataLoaded = false;

  try {
    render(await loadSettings());
    recoveryDataLoaded = true;
    saveStatus.textContent = "";
  } catch (error) {
    secureLoadFailed = true;
    saveButton.disabled = true;

    try {
      render(await loadPersistedSettings());
      recoveryDataLoaded = true;
    } catch {
      recoveryDataLoaded = false;
      render({
        apiBaseUrl: "",
        bearerToken: "",
        provider: "copilot",
        customTitleDefault: "",
        extendedPromptDefault: "",
        participantAliases: {},
      });
    }

    saveStatus.textContent = error instanceof Error ? error.message : "Failed to load settings";
  }

  ensureInput("bearerToken").addEventListener("input", () => {
    if (!secureLoadFailed) return;
    if (!recoveryDataLoaded) {
      saveButton.disabled = true;
      saveStatus.textContent = "Reload after settings storage recovers before saving";
      return;
    }
    saveButton.disabled = false;
    saveStatus.textContent = "Enter token again to re-enable save";
  });

  saveButton.addEventListener("click", async () => {
    const settings = readForm();
    const validationError = validateSettings(settings);

    if (validationError) {
      saveStatus.textContent = validationError;
      return;
    }

    if (secureLoadFailed) {
      if (!recoveryDataLoaded) {
        saveStatus.textContent = "Reload after settings storage recovers before saving";
        return;
      }
      if (!settings.bearerToken) {
        saveStatus.textContent = "Enter token again before saving";
        return;
      }
    }

    try {
      await saveSettings(settings);
      secureLoadFailed = false;
      recoveryDataLoaded = true;
      saveButton.disabled = false;
      saveStatus.textContent = "Saved";
    } catch (error) {
      saveStatus.textContent = error instanceof Error ? error.message : "Failed to save settings";
    }
  });
});

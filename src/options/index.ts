import { loadSettings, saveSettings } from "../shared/storage.js";
import type { PluginSettings, ProviderId } from "../shared/types.js";
import { validateSettings } from "./schema.js";

function ensureInput(id: string): HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing element: ${id}`);
  return element as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
}

function parseAliases(raw: string): Record<string, string> {
  const result: Record<string, string> = {};

  for (const line of raw.split("\n").map((line) => line.trim()).filter(Boolean)) {
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

  render(await loadSettings());

  document.getElementById("save")?.addEventListener("click", async () => {
    const settings = readForm();
    const validationError = validateSettings(settings);

    if (validationError) {
      saveStatus.textContent = validationError;
      return;
    }

    await saveSettings(settings);
    saveStatus.textContent = "Saved";
  });
});

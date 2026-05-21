import { signal } from "@preact/signals";
import { useEffect } from "preact/hooks";
import { validateSettings } from "../../options/schema.js";
import {
  defaultSettings,
  loadPersistedSettings,
  loadSettings,
  saveSettings,
} from "../../shared/storage.js";
import type { PluginSettings, ProviderId } from "../../shared/types.js";
import { Button, Field } from "../shared/primitives.js";

const settings = signal<PluginSettings>({ ...defaultSettings });
const saveStatus = signal<string>("");
const secureLoadFailed = signal(false);
const recoveryDataLoaded = signal(false);

function parseAliases(raw: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)) {
    const [original, alias] = line.split("=").map((p) => p.trim());
    if (original && alias) result[original] = alias;
  }
  return result;
}

function formatAliases(aliases: Record<string, string>): string {
  return Object.entries(aliases)
    .map(([original, alias]) => `${original} = ${alias}`)
    .join("\n");
}

function update<K extends keyof PluginSettings>(key: K, value: PluginSettings[K]): void {
  settings.value = { ...settings.value, [key]: value };
}

async function bootstrap(): Promise<void> {
  try {
    settings.value = await loadSettings();
    recoveryDataLoaded.value = true;
    saveStatus.value = "";
  } catch (error) {
    secureLoadFailed.value = true;
    try {
      settings.value = await loadPersistedSettings();
      recoveryDataLoaded.value = true;
    } catch {
      recoveryDataLoaded.value = false;
      settings.value = { ...defaultSettings };
    }
    saveStatus.value = error instanceof Error ? error.message : "Failed to load settings";
  }
}

async function save(): Promise<void> {
  const validationError = validateSettings(settings.value);
  if (validationError) {
    saveStatus.value = validationError;
    return;
  }
  if (secureLoadFailed.value) {
    if (!recoveryDataLoaded.value) {
      saveStatus.value = "Reload after settings storage recovers before saving";
      return;
    }
    if (!settings.value.bearerToken) {
      saveStatus.value = "Enter token again before saving";
      return;
    }
  }
  try {
    await saveSettings(settings.value);
    secureLoadFailed.value = false;
    recoveryDataLoaded.value = true;
    saveStatus.value = "Saved";
  } catch (error) {
    saveStatus.value = error instanceof Error ? error.message : "Failed to save settings";
  }
}

function bearerHint(): string {
  if (!secureLoadFailed.value) return "";
  if (!recoveryDataLoaded.value) return "Reload after settings storage recovers before saving";
  return "Enter token again to re-enable save";
}

function saveDisabled(): boolean {
  if (!secureLoadFailed.value) return false;
  if (!recoveryDataLoaded.value) return true;
  return !settings.value.bearerToken;
}

export function App(): preact.JSX.Element {
  useEffect(() => {
    void bootstrap();
  }, []);

  const s = settings.value;

  return (
    <main class="stack" style={{ maxWidth: "640px", padding: "var(--space-5)" }}>
      <h1 style={{ margin: 0 }}>Settings</h1>

      <Field
        label="API Base URL"
        htmlFor="apiBaseUrl"
        hint="HTTPS, or HTTP only on localhost/127.0.0.1."
      >
        <input
          id="apiBaseUrl"
          placeholder="https://proxy.example/v1"
          value={s.apiBaseUrl}
          onInput={(e) => update("apiBaseUrl", (e.target as HTMLInputElement).value)}
        />
      </Field>

      <Field label="Bearer Token" htmlFor="bearerToken" hint={bearerHint()}>
        <input
          id="bearerToken"
          type="password"
          autocomplete="off"
          value={s.bearerToken}
          onInput={(e) => {
            update("bearerToken", (e.target as HTMLInputElement).value);
            if (secureLoadFailed.value) {
              saveStatus.value = recoveryDataLoaded.value
                ? "Enter token again to re-enable save"
                : "Reload after settings storage recovers before saving";
            }
          }}
        />
      </Field>

      <Field label="Provider" htmlFor="provider">
        <select
          id="provider"
          value={s.provider}
          onChange={(e) => update("provider", (e.target as HTMLSelectElement).value as ProviderId)}
        >
          <option value="copilot">copilot</option>
          <option value="claude">claude</option>
          <option value="gemini">gemini</option>
        </select>
      </Field>

      <Field label="Default Title" htmlFor="customTitleDefault">
        <input
          id="customTitleDefault"
          value={s.customTitleDefault}
          onInput={(e) => update("customTitleDefault", (e.target as HTMLInputElement).value)}
        />
      </Field>

      <Field
        label="Extended Prompt Default"
        htmlFor="extendedPromptDefault"
        hint="Appended to the default analysis prompt."
      >
        <textarea
          id="extendedPromptDefault"
          rows={4}
          value={s.extendedPromptDefault}
          onInput={(e) => update("extendedPromptDefault", (e.target as HTMLTextAreaElement).value)}
        />
      </Field>

      <Field
        label="Participant Aliases"
        htmlFor="participantAliases"
        hint="One per line, format: Original = Alias"
      >
        <textarea
          id="participantAliases"
          rows={4}
          value={formatAliases(s.participantAliases)}
          onInput={(e) =>
            update("participantAliases", parseAliases((e.target as HTMLTextAreaElement).value))
          }
        />
      </Field>

      <div class="row">
        <Button id="save" variant="primary" onClick={save} disabled={saveDisabled()}>
          Save
        </Button>
        <span id="save-status" class="muted" role="status">
          {saveStatus.value}
        </span>
      </div>
    </main>
  );
}

import { hasApiOriginPermission } from "./permissions.js";
import type { PluginSettings } from "../shared/types.js";

export async function generateAnalysis(
  settings: PluginSettings,
  payload: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<string> {
  if (!settings.apiBaseUrl) {
    throw new Error("API Base URL is not configured");
  }

  if (!(await hasApiOriginPermission(settings.apiBaseUrl))) {
    throw new Error(
      "Missing access to the API origin. Open extension options and click Save to grant it.",
    );
  }

  const response = await fetch(`${settings.apiBaseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(settings.bearerToken ? { Authorization: `Bearer ${settings.bearerToken}` } : {}),
    },
    body: JSON.stringify(payload),
    signal,
  });

  const json = (await response.json()) as {
    error?: { message?: string };
    choices?: Array<{ message?: { content?: string } }>;
  };

  if (!response.ok) {
    throw new Error(json.error?.message || "Request failed");
  }

  return json.choices?.[0]?.message?.content ?? "";
}

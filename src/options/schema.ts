import type { PluginSettings } from "../shared/types.js";

function isAllowedHttpHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return normalized === "localhost" || normalized === "127.0.0.1";
}

export function validateSettings(settings: PluginSettings): string | null {
  if (settings.apiBaseUrl) {
    try {
      const url = new URL(settings.apiBaseUrl);
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        return "API Base URL must use http/https";
      }

      if (url.protocol === "http:" && !isAllowedHttpHostname(url.hostname)) {
        return "HTTP is allowed only for localhost or 127.0.0.1";
      }
    } catch {
      return "API Base URL is invalid";
    }
  }

  return null;
}

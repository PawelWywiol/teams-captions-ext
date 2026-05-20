import type { PluginSettings } from "../shared/types.js";

function isPrivateHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();

  if (normalized === "localhost") return true;
  if (normalized.endsWith(".local")) return true;
  if (/^127(?:\.\d{1,3}){3}$/.test(normalized)) return true;
  if (/^10(?:\.\d{1,3}){3}$/.test(normalized)) return true;
  if (/^192\.168(?:\.\d{1,3}){2}$/.test(normalized)) return true;

  const match172 = normalized.match(/^172\.(\d{1,3})(?:\.\d{1,3}){2}$/);
  if (match172) {
    const second = Number(match172[1]);
    if (second >= 16 && second <= 31) return true;
  }

  return false;
}

export function validateSettings(settings: PluginSettings): string | null {
  if (settings.apiBaseUrl) {
    try {
      const url = new URL(settings.apiBaseUrl);
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        return "API Base URL must use http/https";
      }

      if (url.protocol === "http:" && !isPrivateHostname(url.hostname)) {
        return "HTTP is allowed only for localhost or private network addresses";
      }
    } catch {
      return "API Base URL is invalid";
    }
  }

  return null;
}

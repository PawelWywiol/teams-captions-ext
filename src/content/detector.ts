import type { PluginStatus } from "../shared/types.js";

export function detectTeamsStatus(locationHref: string = window.location.href): PluginStatus {
  let url: URL;

  try {
    url = new URL(locationHref);
  } catch {
    return "error";
  }

  if (!url.hostname.toLowerCase().includes("teams")) {
    return "not_on_teams";
  }

  return "on_teams";
}

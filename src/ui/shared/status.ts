import type { PluginStatus } from "../../shared/types.js";

export type StatusKind = "idle" | "capturing" | "analyzing" | "error";

export function statusKind(status: PluginStatus): StatusKind {
  if (status === "capturing") return "capturing";
  if (status === "analyzing") return "analyzing";
  if (status === "error") return "error";
  return "idle";
}

export function statusLabel(status: PluginStatus): string {
  switch (status) {
    case "not_on_teams":
      return "Open a Teams meeting to start";
    case "on_teams":
      return "On Teams, waiting for captions";
    case "captions_unknown":
      return "Captions not detected";
    case "capturing":
      return "Capturing captions";
    case "analyzing":
      return "Sending to LLM…";
    case "result_ready":
      return "Summary ready";
    case "error":
      return "Error";
    default:
      return status;
  }
}

import { resolveSpeakerName } from "../../aliases/resolver.js";
import type { CaptionEntry, PluginSettings } from "../types.js";
import { chunkToTranscript, type CaptionChunk } from "./chunker.js";
import { DEFAULT_MAP_PROMPT, DEFAULT_REDUCE_PROMPT, SYSTEM_PROMPT } from "./prompts.js";

function speakerOf(settings: PluginSettings) {
  return (entry: CaptionEntry): string =>
    resolveSpeakerName(entry.speakerOriginal, settings.participantAliases) ||
    entry.speakerResolved ||
    "Unknown";
}

export function buildMapPayload(
  chunk: CaptionChunk,
  settings: PluginSettings,
): Record<string, unknown> {
  const transcript = chunkToTranscript(chunk, speakerOf(settings));
  return {
    provider: settings.provider,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          `Title: ${settings.customTitleDefault || "Untitled"}`,
          `Prompt: ${DEFAULT_MAP_PROMPT}`,
          "",
          `Section ${chunk.start} → ${chunk.end}`,
          "",
          "Captions:",
          transcript,
        ].join("\n"),
      },
    ],
    metadata: { client: "teams-captions-ext", request_kind: "captions-map" },
  };
}

export function buildReducePayload(
  chunkSummaries: string[],
  userPrompt: string,
  settings: PluginSettings,
): Record<string, unknown> {
  const extended = [settings.extendedPromptDefault, userPrompt].filter((p) => p.trim()).join("\n");
  return {
    provider: settings.provider,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          `Title: ${settings.customTitleDefault || "Untitled"}`,
          `Prompt: ${DEFAULT_REDUCE_PROMPT}`,
          extended ? `Additional instructions: ${extended}` : "",
          "",
          "Section summaries:",
          chunkSummaries.map((s, i) => `### Section ${i + 1}\n${s}`).join("\n\n"),
        ]
          .filter(Boolean)
          .join("\n"),
      },
    ],
    metadata: { client: "teams-captions-ext", request_kind: "captions-reduce" },
  };
}

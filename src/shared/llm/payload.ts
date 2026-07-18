import { resolveSpeakerName } from "../../aliases/resolver.js";
import type { CaptionEntry, PluginSettings } from "../types.js";
import { chunkToTranscript, type CaptionChunk } from "./chunker.js";
import {
  DATA_ISOLATION_NOTICE,
  DEFAULT_MAP_PROMPT,
  DEFAULT_REDUCE_PROMPT,
  SYSTEM_PROMPT,
} from "./prompts.js";
import { neutralizeInline, neutralizeText, wrapData } from "./sanitize.js";

export function speakerOf(settings: PluginSettings) {
  return (entry: CaptionEntry): string =>
    resolveSpeakerName(entry.speakerOriginal, settings.participantAliases) ||
    entry.speakerResolved ||
    "Unknown";
}

function effectiveTitle(override: string | undefined, settings: PluginSettings): string {
  return neutralizeInline((override?.trim() || settings.customTitleDefault || "Untitled").trim());
}

export type MapOptions = { title?: string };
export type ReduceOptions = { title?: string; previousSummary?: string };

export function buildMapPayload(
  chunk: CaptionChunk,
  settings: PluginSettings,
  options: MapOptions = {},
): Record<string, unknown> {
  const transcript = chunkToTranscript(chunk, speakerOf(settings));
  const system = [
    SYSTEM_PROMPT,
    DATA_ISOLATION_NOTICE,
    `Task: ${DEFAULT_MAP_PROMPT}`,
    `Meeting title (context): ${effectiveTitle(options.title, settings)}`,
    `The transcript section covers ${chunk.start} to ${chunk.end}.`,
  ].join("\n\n");

  return {
    model: settings.provider,
    stream: false,
    messages: [
      { role: "system", content: system },
      { role: "user", content: wrapData("meeting transcript", transcript) },
    ],
    metadata: { client: "teams-captions-ext", request_kind: "captions-map" },
  };
}

export function buildReducePayload(
  chunkSummaries: string[],
  userPrompt: string,
  settings: PluginSettings,
  options: ReduceOptions = {},
): Record<string, unknown> {
  const extended = [settings.extendedPromptDefault, userPrompt].filter((p) => p.trim()).join("\n");

  const systemParts = [
    SYSTEM_PROMPT,
    DATA_ISOLATION_NOTICE,
    `Task: ${DEFAULT_REDUCE_PROMPT}`,
    `Meeting title (context): ${effectiveTitle(options.title, settings)}`,
  ];
  if (extended) systemParts.push(`Additional user instructions: ${extended}`);

  const sections = chunkSummaries
    .map((s, i) => `### Section ${i + 1}\n${neutralizeText(s)}`)
    .join("\n\n");

  const previousBlock = options.previousSummary?.trim()
    ? [
        "",
        "Previous summary (data) - extend or correct without repeating verbatim:",
        wrapData("previous summary", neutralizeText(options.previousSummary.trim())),
      ].join("\n")
    : "";

  return {
    model: settings.provider,
    stream: false,
    messages: [
      { role: "system", content: systemParts.join("\n\n") },
      { role: "user", content: `${wrapData("section summaries", sections)}${previousBlock}` },
    ],
    metadata: { client: "teams-captions-ext", request_kind: "captions-reduce" },
  };
}

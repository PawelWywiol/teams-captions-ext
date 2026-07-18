import type { CaptionEntry } from "../types.js";
import { neutralizeInline, neutralizeText } from "./sanitize.js";

export const GAP_MS = 15 * 60 * 1000;
export const MAX_CHARS = 8000;

export type CaptionChunk = {
  start: string;
  end: string;
  entries: CaptionEntry[];
};

function entryWeight(entry: CaptionEntry): number {
  return (entry.speakerOriginal?.length ?? 0) + entry.text.length + 4;
}

export function chunkEntries(
  entries: CaptionEntry[],
  options: { gapMs?: number; maxChars?: number } = {},
): CaptionChunk[] {
  const gapMs = options.gapMs ?? GAP_MS;
  const maxChars = options.maxChars ?? MAX_CHARS;
  if (!entries.length) return [];

  const chunks: CaptionChunk[] = [];
  let current: CaptionEntry[] = [];
  let currentChars = 0;
  let previousTs = 0;

  for (const entry of entries) {
    const ts = Date.parse(entry.ts);
    const cost = entryWeight(entry);
    const gap = previousTs ? ts - previousTs : 0;
    const shouldBreak = current.length > 0 && (gap >= gapMs || currentChars + cost > maxChars);

    if (shouldBreak) {
      chunks.push(makeChunk(current));
      current = [];
      currentChars = 0;
    }

    current.push(entry);
    currentChars += cost;
    previousTs = ts;
  }

  if (current.length) chunks.push(makeChunk(current));
  return chunks;
}

function makeChunk(entries: CaptionEntry[]): CaptionChunk {
  const first = entries[0];
  const last = entries[entries.length - 1];
  if (!first || !last) throw new Error("chunk requires at least one entry");
  return { start: first.ts, end: last.ts, entries };
}

export function chunkToTranscript(
  chunk: CaptionChunk,
  resolveSpeaker: (entry: CaptionEntry) => string,
): string {
  return chunk.entries
    .map(
      (entry) =>
        `- ${entry.ts} | ${neutralizeInline(resolveSpeaker(entry))}: ${neutralizeText(entry.text)}`,
    )
    .join("\n");
}

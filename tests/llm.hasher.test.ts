import { describe, expect, it } from "vitest";
import { hashChunk, hashPrompt, sha256Hex } from "../src/shared/llm/hasher.js";
import type { CaptionChunk } from "../src/shared/llm/chunker.js";
import type { CaptionEntry } from "../src/shared/types.js";

function entry(ts: string, text: string, speaker = "Alice"): CaptionEntry {
  return { id: ts, ts, speakerOriginal: speaker, text, source: "dom" };
}

function chunk(entries: CaptionEntry[]): CaptionChunk {
  return {
    start: entries[0]!.ts,
    end: entries[entries.length - 1]!.ts,
    entries,
  };
}

describe("hasher", () => {
  it("sha256Hex returns 64-char hex", async () => {
    const hex = await sha256Hex("hello");
    expect(hex).toMatch(/^[0-9a-f]{64}$/);
  });

  it("hashChunk is stable for identical input", async () => {
    const c1 = chunk([entry("2026-05-21T10:00:00.000Z", "hi")]);
    const c2 = chunk([entry("2026-05-21T10:00:00.000Z", "hi")]);
    expect(await hashChunk(c1)).toBe(await hashChunk(c2));
  });

  it("hashChunk differs when content changes", async () => {
    const c1 = chunk([entry("2026-05-21T10:00:00.000Z", "hi")]);
    const c2 = chunk([entry("2026-05-21T10:00:00.000Z", "bye")]);
    expect(await hashChunk(c1)).not.toBe(await hashChunk(c2));
  });

  it("hashPrompt depends on chunk list AND user prompt", async () => {
    const base = await hashPrompt({ chunkHashes: ["a", "b"], userPrompt: "x" });
    expect(await hashPrompt({ chunkHashes: ["a", "b"], userPrompt: "x" })).toBe(base);
    expect(await hashPrompt({ chunkHashes: ["a", "b"], userPrompt: "y" })).not.toBe(base);
    expect(await hashPrompt({ chunkHashes: ["a", "c"], userPrompt: "x" })).not.toBe(base);
  });
});

import { describe, expect, it } from "vitest";
import { chunkEntries, chunkToTranscript } from "../src/shared/llm/chunker.js";
import type { CaptionEntry } from "../src/shared/types.js";

function entry(ts: string, text: string, speaker = "Alice"): CaptionEntry {
  return { id: ts, ts, speakerOriginal: speaker, text, source: "dom" };
}

describe("chunker", () => {
  it("returns no chunks for empty input", () => {
    expect(chunkEntries([])).toEqual([]);
  });

  it("groups entries with small gaps into a single chunk", () => {
    const chunks = chunkEntries([
      entry("2026-05-21T10:00:00.000Z", "one"),
      entry("2026-05-21T10:00:30.000Z", "two"),
      entry("2026-05-21T10:01:00.000Z", "three"),
    ]);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.entries).toHaveLength(3);
  });

  it("splits on time gap above threshold", () => {
    const chunks = chunkEntries(
      [entry("2026-05-21T10:00:00.000Z", "one"), entry("2026-05-21T10:20:00.000Z", "two")],
      { gapMs: 5 * 60 * 1000 },
    );
    expect(chunks).toHaveLength(2);
    expect(chunks[0]?.entries[0]?.text).toBe("one");
    expect(chunks[1]?.entries[0]?.text).toBe("two");
  });

  it("splits when char budget is exceeded", () => {
    const big = "x".repeat(100);
    const entries: CaptionEntry[] = [];
    for (let i = 0; i < 6; i += 1) {
      entries.push(entry(`2026-05-21T10:00:0${i}.000Z`, big));
    }
    const chunks = chunkEntries(entries, { maxChars: 200 });
    expect(chunks.length).toBeGreaterThan(1);
    const total = chunks.reduce((sum, c) => sum + c.entries.length, 0);
    expect(total).toBe(6);
  });

  it("each chunk has start <= end", () => {
    const chunks = chunkEntries([
      entry("2026-05-21T10:00:00.000Z", "a"),
      entry("2026-05-21T10:00:01.000Z", "b"),
    ]);
    for (const c of chunks) {
      expect(Date.parse(c.start)).toBeLessThanOrEqual(Date.parse(c.end));
    }
  });

  it("chunkToTranscript formats entries with speaker resolver", () => {
    const chunks = chunkEntries([
      entry("2026-05-21T10:00:00.000Z", "hello"),
      entry("2026-05-21T10:00:01.000Z", "world", "Bob"),
    ]);
    const text = chunkToTranscript(chunks[0]!, (e) => e.speakerOriginal ?? "?");
    expect(text).toContain("Alice: hello");
    expect(text).toContain("Bob: world");
  });
});

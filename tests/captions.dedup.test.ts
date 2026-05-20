import { describe, expect, it } from "vitest";
import { isDuplicate } from "../src/content/dedup.js";
import type { CaptionEntry } from "../src/shared/types.js";

function makeEntry(overrides: Partial<CaptionEntry> = {}): CaptionEntry {
  return {
    id: crypto.randomUUID(),
    ts: "2026-05-20T10:00:00.000Z",
    speakerOriginal: "Jan Kowalski",
    text: "Hello world",
    source: "dom",
    ...overrides,
  };
}

describe("isDuplicate", () => {
  it("returns true for same speaker and text", () => {
    const existing = [makeEntry({ text: "Hello world" })];
    const next = makeEntry({ text: "Hello world" });

    expect(isDuplicate(existing, next)).toBe(true);
  });

  it("ignores case and extra whitespace", () => {
    const existing = [makeEntry({ text: " Hello   world ", speakerOriginal: "JAN" })];
    const next = makeEntry({ text: "hello world", speakerOriginal: "jan" });

    expect(isDuplicate(existing, next)).toBe(true);
  });

  it("returns false for different text", () => {
    const existing = [makeEntry({ text: "Hello world" })];
    const next = makeEntry({ text: "Different line" });

    expect(isDuplicate(existing, next)).toBe(false);
  });
});

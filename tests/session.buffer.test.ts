import { beforeEach, describe, expect, it } from "vitest";
import { appendCaption, clearSession, getSession } from "../src/session/buffer.js";
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

describe("session buffer", () => {
  beforeEach(() => {
    clearSession();
  });

  it("creates a new session on first append", () => {
    const session = appendCaption("https://teams.example.test/meeting/1", makeEntry());

    expect(session.pageUrl).toBe("https://teams.example.test/meeting/1");
    expect(session.entries).toHaveLength(1);
    expect(getSession()?.entries).toHaveLength(1);
  });

  it("appends non-duplicate entries", () => {
    appendCaption("https://teams.example.test/meeting/1", makeEntry({ text: "First line" }));

    const session = appendCaption("https://teams.example.test/meeting/1", makeEntry({ text: "Second line" }));

    expect(session.entries).toHaveLength(2);
  });

  it("does not append duplicates", () => {
    appendCaption("https://teams.example.test/meeting/1", makeEntry({ text: "Same line" }));

    const session = appendCaption("https://teams.example.test/meeting/1", makeEntry({ text: "Same line" }));

    expect(session.entries).toHaveLength(1);
  });

  it("starts a new session when pageUrl changes", () => {
    appendCaption("https://teams.example.test/meeting/1", makeEntry({ text: "First meeting" }));

    const session = appendCaption("https://teams.example.test/meeting/2", makeEntry({ text: "Second meeting" }));

    expect(session.pageUrl).toBe("https://teams.example.test/meeting/2");
    expect(session.entries).toHaveLength(1);
    expect(session.entries[0]?.text).toBe("Second meeting");
  });

  it("clears current session", () => {
    appendCaption("https://teams.example.test/meeting/1", makeEntry());

    clearSession();

    expect(getSession()).toBeNull();
  });
});

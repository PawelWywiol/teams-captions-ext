import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  appendEntry,
  createSession,
  getDb,
  latestSummary,
  setDbForTesting,
} from "../src/shared/db/index.js";
import { createDatabase } from "../src/shared/db/schema.js";
import type { CaptionEntry, PluginSettings } from "../src/shared/types.js";

const settingsFixture: PluginSettings = {
  apiBaseUrl: "http://127.0.0.1:11434",
  bearerToken: "",
  provider: "copilot",
  customTitleDefault: "Weekly sync",
  extendedPromptDefault: "",
  participantAliases: {},
};

const generateAnalysis = vi.fn<(...args: unknown[]) => Promise<string>>();
const loadSettings = vi.fn<() => Promise<PluginSettings>>(async () => settingsFixture);

vi.mock("../src/api/client.js", () => ({
  generateAnalysis: (...args: unknown[]) => generateAnalysis(...args),
}));

vi.mock("../src/shared/storage.js", () => ({
  loadSettings: () => loadSettings(),
  defaultSettings: settingsFixture,
}));

function makeEntry(text: string, tsOffsetSec: number): CaptionEntry {
  return {
    id: crypto.randomUUID(),
    ts: new Date(Date.UTC(2026, 4, 21, 10, 0, tsOffsetSec)).toISOString(),
    speakerOriginal: "Alice",
    text,
    source: "dom",
  };
}

describe("LLM orchestrator", () => {
  beforeEach(() => {
    const db = createDatabase(`orch-${crypto.randomUUID()}`);
    setDbForTesting(db);
    generateAnalysis.mockReset();
    loadSettings.mockClear();
  });

  afterEach(async () => {
    const db = getDb();
    db.close();
    await indexedDB.deleteDatabase(db.name);
    setDbForTesting(null);
    vi.restoreAllMocks();
  });

  it("runs map per chunk and reduce once, persisting summary", async () => {
    const { analyzeSession } = await import("../src/shared/llm/orchestrator.js");
    generateAnalysis.mockResolvedValueOnce("map-1").mockResolvedValueOnce("reduce-final");

    const s = await createSession("https://teams.microsoft.com/m/1");
    await appendEntry(s.id, makeEntry("hi", 0));
    await appendEntry(s.id, makeEntry("there", 1));

    const result = await analyzeSession(s.id, { userPrompt: "" });
    expect(result.summary.content).toBe("reduce-final");
    expect(generateAnalysis).toHaveBeenCalledTimes(2);

    const stored = await latestSummary(s.id);
    expect(stored?.content).toBe("reduce-final");
  });

  it("caches map results — second analyse only runs reduce", async () => {
    const { analyzeSession } = await import("../src/shared/llm/orchestrator.js");
    generateAnalysis
      .mockResolvedValueOnce("map-1")
      .mockResolvedValueOnce("reduce-A")
      .mockResolvedValueOnce("reduce-B");

    const s = await createSession("https://teams.microsoft.com/m/1");
    await appendEntry(s.id, makeEntry("hello", 0));

    const first = await analyzeSession(s.id, { userPrompt: "" });
    expect(first.fromCache.map).toBe(0);
    expect(generateAnalysis).toHaveBeenCalledTimes(2);

    const second = await analyzeSession(s.id, { userPrompt: "v2" });
    expect(second.fromCache.map).toBe(1);
    expect(second.fromCache.total).toBe(1);
    expect(second.summary.content).toBe("reduce-B");
    expect(generateAnalysis).toHaveBeenCalledTimes(3);
  });

  it("rejects when no entries", async () => {
    const { analyzeSession } = await import("../src/shared/llm/orchestrator.js");
    const s = await createSession("https://teams.microsoft.com/m/empty");
    await expect(analyzeSession(s.id)).rejects.toThrow(/no captions/i);
    expect(generateAnalysis).not.toHaveBeenCalled();
  });

  it("keeps only the latest summary per session", async () => {
    const { analyzeSession } = await import("../src/shared/llm/orchestrator.js");
    generateAnalysis
      .mockResolvedValueOnce("map-1")
      .mockResolvedValueOnce("reduce-1")
      .mockResolvedValueOnce("reduce-2");

    const s = await createSession("https://teams.microsoft.com/m/1");
    await appendEntry(s.id, makeEntry("foo", 0));

    await analyzeSession(s.id);
    await analyzeSession(s.id, { userPrompt: "new" });

    const db = getDb();
    const all = await db.summaries.where("sessionId").equals(s.id).toArray();
    expect(all).toHaveLength(1);
    expect(all[0]?.content).toBe("reduce-2");
  });
});

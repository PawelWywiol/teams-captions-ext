import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  upsertEntry,
  createSession,
  getDb,
  getProgress,
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
    await upsertEntry(s.id, makeEntry("hi", 0));
    await upsertEntry(s.id, makeEntry("there", 1));

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
    await upsertEntry(s.id, makeEntry("hello", 0));

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

  it("includes previous summary in reduce payload when includePrevious=true", async () => {
    const { analyzeSession } = await import("../src/shared/llm/orchestrator.js");
    generateAnalysis
      .mockResolvedValueOnce("map-1")
      .mockResolvedValueOnce("first-summary")
      .mockResolvedValueOnce("second-summary");

    const s = await createSession("https://teams.microsoft.com/m/prev");
    await upsertEntry(s.id, makeEntry("hello", 0));

    const first = await analyzeSession(s.id, { userPrompt: "" });
    expect(first.previousIncluded).toBe(false);

    const second = await analyzeSession(s.id, {
      userPrompt: "follow-up",
      title: "Sprint review",
      includePrevious: true,
    });
    expect(second.previousIncluded).toBe(true);
    expect(second.summary.content).toBe("second-summary");

    const reduceCall = generateAnalysis.mock.calls.at(-1);
    expect(reduceCall).toBeTruthy();
    const payload = reduceCall?.[1] as {
      messages: Array<{ role: string; content: string }>;
    };
    const systemContent = payload.messages[0]?.content ?? "";
    const userContent = payload.messages[1]?.content ?? "";
    // Instructions (title + user prompt) live in the system message.
    expect(systemContent).toContain("Sprint review");
    expect(systemContent).toContain("Additional user instructions:");
    expect(systemContent).toContain("follow-up");
    // Data (summaries + previous summary) lives, delimited, in the user message.
    expect(userContent).toContain("first-summary");
    expect(userContent).toContain("Previous summary (data)");
    expect(userContent).toContain("<<<DATA_BEGIN>>>");
  });

  it("does not include previous summary when includePrevious=false", async () => {
    const { analyzeSession } = await import("../src/shared/llm/orchestrator.js");
    generateAnalysis
      .mockResolvedValueOnce("map-1")
      .mockResolvedValueOnce("first-summary")
      .mockResolvedValueOnce("second-summary");

    const s = await createSession("https://teams.microsoft.com/m/noprev");
    await upsertEntry(s.id, makeEntry("hello", 0));

    await analyzeSession(s.id, {});
    const second = await analyzeSession(s.id, { userPrompt: "x" });
    expect(second.previousIncluded).toBe(false);

    const reduceCall = generateAnalysis.mock.calls.at(-1);
    const payload = reduceCall?.[1] as { messages: Array<{ content: string }> };
    expect(payload.messages[1]?.content ?? "").not.toContain("Previous summary (data)");
  });

  it("keeps only the latest summary per session", async () => {
    const { analyzeSession } = await import("../src/shared/llm/orchestrator.js");
    generateAnalysis
      .mockResolvedValueOnce("map-1")
      .mockResolvedValueOnce("reduce-1")
      .mockResolvedValueOnce("reduce-2");

    const s = await createSession("https://teams.microsoft.com/m/1");
    await upsertEntry(s.id, makeEntry("foo", 0));

    await analyzeSession(s.id);
    await analyzeSession(s.id, { userPrompt: "new" });

    const db = getDb();
    const all = await db.summaries.where("sessionId").equals(s.id).toArray();
    expect(all).toHaveLength(1);
    expect(all[0]?.content).toBe("reduce-2");
  });

  it("writes progress to done on a successful run", async () => {
    const { analyzeSession } = await import("../src/shared/llm/orchestrator.js");
    generateAnalysis.mockResolvedValueOnce("map-1").mockResolvedValueOnce("reduce-final");

    const s = await createSession("https://teams.microsoft.com/m/p1");
    await upsertEntry(s.id, makeEntry("hello world", 0));

    await analyzeSession(s.id, { userPrompt: "" });

    const progress = await getProgress(s.id);
    expect(progress?.phase).toBe("done");
    expect(progress?.totalChunks).toBe(1);
    expect(progress?.completedChunks).toBe(1);
    expect(progress?.charsSent).toBeGreaterThan(0);
    expect(progress?.charsTotal).toBeGreaterThan(0);
  });

  it("counts cached chunks without adding to charsSent", async () => {
    const { analyzeSession } = await import("../src/shared/llm/orchestrator.js");
    generateAnalysis
      .mockResolvedValueOnce("map-1")
      .mockResolvedValueOnce("reduce-A")
      .mockResolvedValueOnce("reduce-B");

    const s = await createSession("https://teams.microsoft.com/m/p2");
    await upsertEntry(s.id, makeEntry("hello", 0));

    await analyzeSession(s.id, {});
    await analyzeSession(s.id, { userPrompt: "again" });

    const progress = await getProgress(s.id);
    expect(progress?.phase).toBe("done");
    expect(progress?.cachedChunks).toBe(1);
    expect(progress?.charsSent).toBe(0);
  });

  it("aborts before any CLI call when the signal is already aborted", async () => {
    const { analyzeSession } = await import("../src/shared/llm/orchestrator.js");
    const s = await createSession("https://teams.microsoft.com/m/p3");
    await upsertEntry(s.id, makeEntry("hello", 0));

    const controller = new AbortController();
    controller.abort();

    await expect(analyzeSession(s.id, {}, controller.signal)).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(generateAnalysis).not.toHaveBeenCalled();
    expect((await getProgress(s.id))?.phase).toBe("aborted");
  });

  it("writes the error phase when a CLI call throws", async () => {
    const { analyzeSession } = await import("../src/shared/llm/orchestrator.js");
    generateAnalysis.mockRejectedValueOnce(new Error("boom"));

    const s = await createSession("https://teams.microsoft.com/m/err");
    await upsertEntry(s.id, makeEntry("hello", 0));

    await expect(analyzeSession(s.id, {})).rejects.toThrow("boom");
    const progress = await getProgress(s.id);
    expect(progress?.phase).toBe("error");
    expect(progress?.error).toContain("boom");
  });
});

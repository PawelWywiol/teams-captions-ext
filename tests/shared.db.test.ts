import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  appendEntry,
  countEntries,
  createSession,
  deleteSession,
  endSession,
  findActiveSessionForUrl,
  getDb,
  getRecentEntries,
  getSessionEntries,
  listSessions,
  loadSession,
  renameSession,
  setDbForTesting,
} from "../src/shared/db/index.js";
import { createDatabase } from "../src/shared/db/schema.js";
import type { CaptionEntry } from "../src/shared/types.js";

function makeEntry(overrides: Partial<CaptionEntry> = {}): CaptionEntry {
  return {
    id: crypto.randomUUID(),
    ts: new Date().toISOString(),
    speakerOriginal: "Alice",
    text: "Hello world",
    source: "dom",
    ...overrides,
  };
}

describe("captions db", () => {
  beforeEach(() => {
    const db = createDatabase(`test-${crypto.randomUUID()}`);
    setDbForTesting(db);
  });

  afterEach(async () => {
    const db = getDb();
    db.close();
    await indexedDB.deleteDatabase(db.name);
    setDbForTesting(null);
  });

  it("creates and retrieves a session", async () => {
    const session = await createSession("https://teams.microsoft.com/meeting/1");
    expect(session.id).toBeTruthy();
    expect(session.pageUrl).toBe("https://teams.microsoft.com/meeting/1");
    expect(session.title).toContain("teams.microsoft.com");

    const found = await findActiveSessionForUrl("https://teams.microsoft.com/meeting/1");
    expect(found?.id).toBe(session.id);
  });

  it("finds only active (non-ended) session for url", async () => {
    const first = await createSession("https://teams.microsoft.com/meeting/1");
    await endSession(first.id);
    const replacement = await createSession("https://teams.microsoft.com/meeting/1");

    const found = await findActiveSessionForUrl("https://teams.microsoft.com/meeting/1");
    expect(found?.id).toBe(replacement.id);
  });

  it("appends entries scoped to a session", async () => {
    const a = await createSession("https://teams.microsoft.com/a");
    const b = await createSession("https://teams.microsoft.com/b");

    await appendEntry(a.id, makeEntry({ text: "in A", ts: "2026-05-21T10:00:00.000Z" }));
    await appendEntry(b.id, makeEntry({ text: "in B", ts: "2026-05-21T10:00:01.000Z" }));
    await appendEntry(a.id, makeEntry({ text: "also A", ts: "2026-05-21T10:00:02.000Z" }));

    const aEntries = await getSessionEntries(a.id);
    expect(aEntries.map((e) => e.text)).toEqual(["in A", "also A"]);
    expect(await countEntries(a.id)).toBe(2);
    expect(await countEntries(b.id)).toBe(1);
  });

  it("returns recent entries in chronological order", async () => {
    const s = await createSession("https://teams.microsoft.com/x");
    for (let i = 0; i < 8; i += 1) {
      await appendEntry(s.id, makeEntry({ text: `t${i}`, ts: `2026-05-21T10:00:0${i}.000Z` }));
    }
    const recent = await getRecentEntries(s.id, 3);
    expect(recent.map((e) => e.text)).toEqual(["t5", "t6", "t7"]);
  });

  it("loads session with entries projected as CaptionSession", async () => {
    const s = await createSession("https://teams.microsoft.com/y");
    await appendEntry(s.id, makeEntry({ text: "one", ts: "2026-05-21T10:00:00.000Z" }));
    const loaded = await loadSession(s.id);
    expect(loaded).not.toBeNull();
    expect(loaded?.entries).toHaveLength(1);
    const [entry] = loaded?.entries ?? [];
    expect(entry?.text).toBe("one");
    expect((entry as Record<string, unknown> | undefined)?.sessionId).toBeUndefined();
  });

  it("updates updatedAt on append", async () => {
    const s = await createSession("https://teams.microsoft.com/z");
    const before = s.updatedAt;
    await new Promise((r) => setTimeout(r, 5));
    await appendEntry(s.id, makeEntry());
    const after = (await loadSession(s.id))?.updatedAt;
    expect(after).not.toBe(before);
  });

  it("deletes session and cascades entries", async () => {
    const s = await createSession("https://teams.microsoft.com/d");
    await appendEntry(s.id, makeEntry());
    await deleteSession(s.id);
    expect(await loadSession(s.id)).toBeNull();
    expect(await countEntries(s.id)).toBe(0);
  });

  it("renames session and rejects empty title", async () => {
    const s = await createSession("https://teams.microsoft.com/r");
    await renameSession(s.id, "Sprint planning");
    const found = (await listSessions())[0];
    expect(found?.title).toBe("Sprint planning");
    await expect(renameSession(s.id, "   ")).rejects.toThrow(/title/i);
  });

  it("lists sessions newest first", async () => {
    const a = await createSession("https://teams.microsoft.com/list-a");
    await new Promise((r) => setTimeout(r, 5));
    const b = await createSession("https://teams.microsoft.com/list-b");
    const sessions = await listSessions();
    expect(sessions.map((s) => s.id)).toEqual([b.id, a.id]);
  });
});

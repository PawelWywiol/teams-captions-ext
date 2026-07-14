import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createAndActivateSession,
  getActiveSession,
  getActiveSessionId,
  ingestCaption,
  setActiveSession,
  stopActiveSession,
} from "../src/background/session-orchestrator.js";
import { getDb, listSessions, setDbForTesting } from "../src/shared/db/index.js";
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

describe("session orchestrator", () => {
  beforeEach(() => {
    const db = createDatabase(`orch-${crypto.randomUUID()}`);
    setDbForTesting(db);
  });

  afterEach(async () => {
    const db = getDb();
    db.close();
    await indexedDB.deleteDatabase(db.name);
    setDbForTesting(null);
  });

  it("creates a session on first caption and persists it", async () => {
    const session = await ingestCaption(
      "https://teams.microsoft.com/m/1",
      makeEntry({ text: "hi" }),
    );
    expect(session.entries).toHaveLength(1);
    expect(await getActiveSessionId()).toBe(session.sessionId);

    const persisted = await listSessions();
    expect(persisted).toHaveLength(1);
  });

  it("appends non-duplicate captions to same session", async () => {
    await ingestCaption("https://teams.microsoft.com/m/1", makeEntry({ text: "one" }));
    const s = await ingestCaption("https://teams.microsoft.com/m/1", makeEntry({ text: "two" }));
    expect(s.entries.map((e) => e.text)).toEqual(["one", "two"]);
  });

  it("dedupes consecutive identical captions", async () => {
    await ingestCaption("https://teams.microsoft.com/m/1", makeEntry({ text: "same" }));
    const s = await ingestCaption("https://teams.microsoft.com/m/1", makeEntry({ text: "same" }));
    expect(s.entries).toHaveLength(1);
  });

  it("restores the session row when it vanishes mid-capture", async () => {
    const url = "https://teams.microsoft.com/m/1";
    const first = await ingestCaption(url, makeEntry({ text: "one" }));
    await getDb().sessions.delete(first.sessionId);

    const healed = await ingestCaption(url, makeEntry({ text: "two" }));
    expect(healed.sessionId).toBe(first.sessionId);
    expect(healed.entries.map((e) => e.text)).toEqual(["one", "two"]);
    expect(await listSessions()).toHaveLength(1);
  });

  it("upserts progressive updates of one utterance into a single row", async () => {
    const id = crypto.randomUUID();
    const ts = "2026-05-21T10:00:00.000Z";
    const url = "https://teams.microsoft.com/m/1";

    await ingestCaption(url, makeEntry({ id, ts, text: "raz" }));
    await ingestCaption(url, makeEntry({ id, ts, text: "raz dwa" }));
    const s = await ingestCaption(url, makeEntry({ id, ts, text: "raz dwa trzy" }));

    expect(s.entries).toHaveLength(1);
    expect(s.entries[0]).toMatchObject({ id, ts, text: "raz dwa trzy" });
  });

  it("starts new session when pageUrl changes and ends previous", async () => {
    await ingestCaption("https://teams.microsoft.com/m/1", makeEntry({ text: "first" }));
    const second = await ingestCaption(
      "https://teams.microsoft.com/m/2",
      makeEntry({ text: "second" }),
    );
    expect(second.pageUrl).toBe("https://teams.microsoft.com/m/2");
    expect(second.entries).toHaveLength(1);

    const all = await listSessions();
    expect(all).toHaveLength(2);
    expect(all.find((s) => s.id === second.sessionId)?.endedAt).toBeUndefined();
    const prior = all.find((s) => s.id !== second.sessionId);
    expect(prior?.endedAt).toBeTruthy();
  });

  it("stops active session and clears the pointer", async () => {
    await ingestCaption("https://teams.microsoft.com/m/1", makeEntry());
    await stopActiveSession();
    expect(await getActiveSessionId()).toBeNull();
    expect(await getActiveSession()).toBeNull();
    const all = await listSessions();
    expect(all[0]?.endedAt).toBeTruthy();
  });

  it("keeps the same active session for same url across restarts (pointer persisted)", async () => {
    const first = await ingestCaption("https://teams.microsoft.com/m/1", makeEntry({ text: "a" }));
    const reopened = await ingestCaption(
      "https://teams.microsoft.com/m/1",
      makeEntry({ text: "b" }),
    );
    expect(reopened.sessionId).toBe(first.sessionId);
    expect(reopened.entries.map((e) => e.text)).toEqual(["a", "b"]);
  });

  it("createAndActivateSession makes a fresh session active without deleting the old one", async () => {
    const first = await ingestCaption("https://teams.microsoft.com/m/1", makeEntry({ text: "a" }));
    const created = await createAndActivateSession("https://teams.microsoft.com/m/1");

    expect(created.id).not.toBe(first.sessionId);
    expect(await getActiveSessionId()).toBe(created.id);
    expect(await listSessions()).toHaveLength(2);

    const next = await ingestCaption("https://teams.microsoft.com/m/1", makeEntry({ text: "b" }));
    expect(next.sessionId).toBe(created.id);
  });

  it("setActiveSession redirects capture to a chosen session", async () => {
    const first = await ingestCaption("https://teams.microsoft.com/m/1", makeEntry({ text: "a" }));
    await createAndActivateSession("https://teams.microsoft.com/m/1");

    await setActiveSession(first.sessionId);
    expect(await getActiveSessionId()).toBe(first.sessionId);

    const back = await ingestCaption("https://teams.microsoft.com/m/1", makeEntry({ text: "b" }));
    expect(back.sessionId).toBe(first.sessionId);
    expect(back.entries.map((e) => e.text)).toEqual(["a", "b"]);
  });
});

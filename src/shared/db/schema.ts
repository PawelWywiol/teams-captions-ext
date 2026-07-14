import { Dexie, type EntityTable } from "dexie";
import type { CaptionEntry } from "../types.js";

export type StoredCaptionEntry = CaptionEntry & {
  sessionId: string;
};

export type StoredSession = {
  id: string;
  pageUrl: string;
  title: string;
  prompt?: string;
  startedAt: string;
  updatedAt: string;
  endedAt?: string;
};

export type MetaRow = {
  key: string;
  value: string;
};

export type StoredChunk = {
  id: string;
  sessionId: string;
  hash: string;
  rangeStart: string;
  rangeEnd: string;
  summary: string;
  createdAt: string;
};

export type StoredSummary = {
  id: string;
  sessionId: string;
  promptHash: string;
  content: string;
  chunkHashes: string[];
  createdAt: string;
};

export type CaptionsDb = Dexie & {
  sessions: EntityTable<StoredSession, "id">;
  entries: EntityTable<StoredCaptionEntry, "id">;
  chunks: EntityTable<StoredChunk, "id">;
  summaries: EntityTable<StoredSummary, "id">;
  meta: EntityTable<MetaRow, "key">;
};

export const DB_NAME = "teams-captions-ext";
export const DB_VERSION = 3;

export const ACTIVE_SESSION_KEY = "activeSessionId";

export function createDatabase(name: string = DB_NAME): CaptionsDb {
  const db = new Dexie(name) as CaptionsDb;

  db.version(1).stores({
    sessions: "id, pageUrl, startedAt, updatedAt",
    entries: "id, sessionId, ts, [sessionId+ts]",
  });

  db.version(2).stores({
    sessions: "id, pageUrl, startedAt, updatedAt",
    entries: "id, sessionId, ts, [sessionId+ts]",
    chunks: "id, sessionId, hash, [sessionId+hash]",
    summaries: "id, sessionId, createdAt",
  });

  db.version(3)
    .stores({
      sessions: "id, pageUrl, startedAt, updatedAt",
      entries: "id, sessionId, ts, [sessionId+ts]",
      chunks: "id, sessionId, hash, [sessionId+hash]",
      summaries: "id, sessionId, createdAt",
      meta: "key",
    })
    .upgrade(async (tx) => {
      // Seed the explicit active-session pointer from the last non-ended session
      // so existing users keep collecting into their in-progress meeting.
      const latest = await tx
        .table<StoredSession>("sessions")
        .orderBy("startedAt")
        .reverse()
        .filter((s) => !s.endedAt)
        .first();
      if (latest) {
        await tx.table<MetaRow>("meta").put({ key: ACTIVE_SESSION_KEY, value: latest.id });
      }
    });

  return db;
}

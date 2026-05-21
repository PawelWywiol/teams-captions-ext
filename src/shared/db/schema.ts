import { Dexie, type EntityTable } from "dexie";
import type { CaptionEntry } from "../types.js";

export type StoredCaptionEntry = CaptionEntry & {
  sessionId: string;
};

export type StoredSession = {
  id: string;
  pageUrl: string;
  title: string;
  startedAt: string;
  updatedAt: string;
  endedAt?: string;
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
};

export const DB_NAME = "teams-captions-ext";
export const DB_VERSION = 2;

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

  return db;
}

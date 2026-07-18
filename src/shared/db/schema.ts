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

export type StoredPromptTemplate = {
  id: string;
  name: string;
  title: string;
  body: string;
  createdAt: string;
  updatedAt: string;
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

export type AnalysisPhase = "preparing" | "mapping" | "reducing" | "done" | "error" | "aborted";

export type StoredProgress = {
  sessionId: string;
  runId: string;
  phase: AnalysisPhase;
  totalChunks: number;
  completedChunks: number;
  cachedChunks: number;
  currentChunk: number;
  charsSent: number;
  charsTotal: number;
  updatedAt: string;
  error?: string;
};

export type CaptionsDb = Dexie & {
  sessions: EntityTable<StoredSession, "id">;
  entries: EntityTable<StoredCaptionEntry, "id">;
  chunks: EntityTable<StoredChunk, "id">;
  summaries: EntityTable<StoredSummary, "id">;
  meta: EntityTable<MetaRow, "key">;
  progress: EntityTable<StoredProgress, "sessionId">;
  promptTemplates: EntityTable<StoredPromptTemplate, "id">;
};

export const DB_NAME = "teams-captions-ext";
export const DB_VERSION = 5;

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

  db.version(4).stores({
    sessions: "id, pageUrl, startedAt, updatedAt",
    entries: "id, sessionId, ts, [sessionId+ts]",
    chunks: "id, sessionId, hash, [sessionId+hash]",
    summaries: "id, sessionId, createdAt",
    meta: "key",
    progress: "sessionId",
  });

  db.version(5).stores({
    sessions: "id, pageUrl, startedAt, updatedAt",
    entries: "id, sessionId, ts, [sessionId+ts]",
    chunks: "id, sessionId, hash, [sessionId+hash]",
    summaries: "id, sessionId, createdAt",
    meta: "key",
    progress: "sessionId",
    promptTemplates: "id, name, updatedAt",
  });

  return db;
}

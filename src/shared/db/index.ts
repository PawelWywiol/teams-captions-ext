import { Dexie, liveQuery, type Observable } from "dexie";
import type { CaptionEntry, CaptionSession } from "../types.js";
import {
  ACTIVE_SESSION_KEY,
  createDatabase,
  type AnalysisPhase,
  type CaptionsDb,
  type StoredCaptionEntry,
  type StoredChunk,
  type StoredProgress,
  type StoredPromptTemplate,
  type StoredSession,
  type StoredSummary,
} from "./schema.js";

let instance: CaptionsDb | null = null;

export function getDb(): CaptionsDb {
  if (!instance) {
    instance = createDatabase();
  }
  return instance;
}

export function setDbForTesting(db: CaptionsDb | null): void {
  instance = db;
}

function nowIso(): string {
  return new Date().toISOString();
}

function deriveTitle(pageUrl: string, startedAt: string): string {
  try {
    const url = new URL(pageUrl);
    const host = url.hostname.replace(/^www\./, "");
    return `${host} – ${startedAt.slice(0, 16).replace("T", " ")}`;
  } catch {
    return `Meeting – ${startedAt.slice(0, 16).replace("T", " ")}`;
  }
}

export function buildSession(pageUrl: string, id: string = crypto.randomUUID()): StoredSession {
  const startedAt = nowIso();
  return { id, pageUrl, title: deriveTitle(pageUrl, startedAt), startedAt, updatedAt: startedAt };
}

export async function createSession(pageUrl: string): Promise<StoredSession> {
  const session = buildSession(pageUrl);
  await getDb().sessions.add(session);
  return session;
}

export async function putSession(session: StoredSession): Promise<void> {
  await getDb().sessions.put(session);
}

export async function getSession(sessionId: string): Promise<StoredSession | null> {
  return (await getDb().sessions.get(sessionId)) ?? null;
}

export async function updateSession(
  sessionId: string,
  patch: { title?: string; prompt?: string },
): Promise<void> {
  const changes: { title?: string; prompt?: string } = {};
  if (patch.title !== undefined) {
    const trimmed = patch.title.trim();
    if (!trimmed) throw new Error("Session title must not be empty");
    changes.title = trimmed;
  }
  if (patch.prompt !== undefined) changes.prompt = patch.prompt;
  if (Object.keys(changes).length) await getDb().sessions.update(sessionId, changes);
}

export async function getActiveSessionId(): Promise<string | null> {
  const row = await getDb().meta.get(ACTIVE_SESSION_KEY);
  return row?.value ?? null;
}

export async function setActiveSessionId(sessionId: string | null): Promise<void> {
  const db = getDb();
  if (sessionId === null) {
    await db.meta.delete(ACTIVE_SESSION_KEY);
    return;
  }
  await db.meta.put({ key: ACTIVE_SESSION_KEY, value: sessionId });
}

export function watchActiveSessionId(): Observable<string | null> {
  return liveQuery(() => getActiveSessionId());
}

export async function upsertEntry(sessionId: string, entry: CaptionEntry): Promise<void> {
  const db = getDb();
  const stored: StoredCaptionEntry = { ...entry, sessionId };
  await db.transaction("rw", db.entries, db.sessions, async () => {
    await db.entries.put(stored);
    await db.sessions.update(sessionId, { updatedAt: nowIso() });
  });
}

export async function getRecentEntries(
  sessionId: string,
  limit = 5,
): Promise<StoredCaptionEntry[]> {
  const db = getDb();
  const rows = await db.entries
    .where("[sessionId+ts]")
    .between([sessionId, Dexie.minKey], [sessionId, Dexie.maxKey])
    .reverse()
    .limit(limit)
    .toArray();
  return rows.reverse();
}

export async function listSessions(): Promise<StoredSession[]> {
  const db = getDb();
  return db.sessions.orderBy("startedAt").reverse().toArray();
}

export async function getSessionEntries(sessionId: string): Promise<StoredCaptionEntry[]> {
  const db = getDb();
  return db.entries
    .where("[sessionId+ts]")
    .between([sessionId, Dexie.minKey], [sessionId, Dexie.maxKey])
    .toArray();
}

export async function loadSession(sessionId: string): Promise<CaptionSession | null> {
  const db = getDb();
  const session = await db.sessions.get(sessionId);
  if (!session) return null;
  const entries = await getSessionEntries(sessionId);
  return {
    sessionId: session.id,
    pageUrl: session.pageUrl,
    startedAt: session.startedAt,
    updatedAt: session.updatedAt,
    entries: entries.map(({ sessionId: _ignored, ...rest }) => rest),
  };
}

export async function endSession(sessionId: string): Promise<void> {
  const db = getDb();
  await db.sessions.update(sessionId, { endedAt: nowIso() });
}

export async function deleteSession(sessionId: string): Promise<void> {
  const db = getDb();
  await db.transaction(
    "rw",
    [db.sessions, db.entries, db.chunks, db.summaries, db.meta, db.progress],
    async () => {
      await db.entries.where("sessionId").equals(sessionId).delete();
      await db.chunks.where("sessionId").equals(sessionId).delete();
      await db.summaries.where("sessionId").equals(sessionId).delete();
      await db.progress.delete(sessionId);
      await db.sessions.delete(sessionId);
      const active = await db.meta.get(ACTIVE_SESSION_KEY);
      if (active?.value === sessionId) await db.meta.delete(ACTIVE_SESSION_KEY);
    },
  );
}

export async function findChunkByHash(
  sessionId: string,
  hash: string,
): Promise<StoredChunk | null> {
  const db = getDb();
  const row = await db.chunks.where("[sessionId+hash]").equals([sessionId, hash]).first();
  return row ?? null;
}

export async function saveChunk(chunk: StoredChunk): Promise<void> {
  await getDb().chunks.put(chunk);
}

export async function latestSummary(sessionId: string): Promise<StoredSummary | null> {
  const db = getDb();
  const row = await db.summaries
    .where("sessionId")
    .equals(sessionId)
    .reverse()
    .sortBy("createdAt")
    .then((rows) => rows[0] ?? null);
  return row;
}

export async function saveSummary(summary: StoredSummary): Promise<void> {
  const db = getDb();
  await db.transaction("rw", db.summaries, async () => {
    await db.summaries.where("sessionId").equals(summary.sessionId).delete();
    await db.summaries.add(summary);
  });
}

export function watchLatestSummary(sessionId: string): Observable<StoredSummary | null> {
  return liveQuery(() => latestSummary(sessionId));
}

export async function renameSession(sessionId: string, title: string): Promise<void> {
  await updateSession(sessionId, { title });
}

export async function countEntries(sessionId: string): Promise<number> {
  return getDb().entries.where("sessionId").equals(sessionId).count();
}

export function watchSessions(): Observable<StoredSession[]> {
  return liveQuery(() => listSessions());
}

export function watchSessionEntries(sessionId: string): Observable<StoredCaptionEntry[]> {
  return liveQuery(() => getSessionEntries(sessionId));
}

const ACTIVE_PHASES: AnalysisPhase[] = ["preparing", "mapping", "reducing"];

export async function patchProgress(
  sessionId: string,
  patch: Partial<StoredProgress>,
): Promise<void> {
  try {
    const db = getDb();
    const existing = await db.progress.get(sessionId);
    const base: StoredProgress = existing ?? {
      sessionId,
      runId: "",
      phase: "preparing",
      totalChunks: 0,
      completedChunks: 0,
      cachedChunks: 0,
      currentChunk: 0,
      charsSent: 0,
      charsTotal: 0,
      updatedAt: nowIso(),
    };
    await db.progress.put({ ...base, ...patch, sessionId, updatedAt: nowIso() });
  } catch (error) {
    console.error("[teams-captions] patchProgress failed", error);
  }
}

export async function getProgress(sessionId: string): Promise<StoredProgress | null> {
  return (await getDb().progress.get(sessionId)) ?? null;
}

export async function clearProgress(sessionId: string): Promise<void> {
  await getDb().progress.delete(sessionId);
}

export function watchAnalysisProgress(sessionId: string): Observable<StoredProgress | null> {
  return liveQuery(() => getProgress(sessionId));
}

export type PromptTemplateInput = { name: string; title?: string; body?: string };

export async function listPromptTemplates(): Promise<StoredPromptTemplate[]> {
  return getDb().promptTemplates.orderBy("name").toArray();
}

export function watchPromptTemplates(): Observable<StoredPromptTemplate[]> {
  return liveQuery(() => listPromptTemplates());
}

export async function getPromptTemplate(id: string): Promise<StoredPromptTemplate | null> {
  return (await getDb().promptTemplates.get(id)) ?? null;
}

export async function createPromptTemplate(
  input: PromptTemplateInput,
): Promise<StoredPromptTemplate> {
  const name = input.name.trim();
  if (!name) throw new Error("Prompt name must not be empty");
  const now = nowIso();
  const template: StoredPromptTemplate = {
    id: crypto.randomUUID(),
    name,
    title: input.title?.trim() ?? "",
    body: input.body ?? "",
    createdAt: now,
    updatedAt: now,
  };
  await getDb().promptTemplates.add(template);
  return template;
}

export async function updatePromptTemplate(
  id: string,
  patch: Partial<PromptTemplateInput>,
): Promise<void> {
  const changes: Partial<StoredPromptTemplate> = {};
  if (patch.name !== undefined) {
    const trimmed = patch.name.trim();
    if (!trimmed) throw new Error("Prompt name must not be empty");
    changes.name = trimmed;
  }
  if (patch.title !== undefined) changes.title = patch.title.trim();
  if (patch.body !== undefined) changes.body = patch.body;
  if (Object.keys(changes).length) {
    changes.updatedAt = nowIso();
    await getDb().promptTemplates.update(id, changes);
  }
}

export async function deletePromptTemplate(id: string): Promise<void> {
  await getDb().promptTemplates.delete(id);
}

export async function reconcileInterruptedAnalyses(): Promise<void> {
  const db = getDb();
  const orphaned = await db.progress.filter((row) => ACTIVE_PHASES.includes(row.phase)).toArray();
  await Promise.all(
    orphaned.map((row) =>
      db.progress.update(row.sessionId, { phase: "aborted", updatedAt: nowIso() }),
    ),
  );
}

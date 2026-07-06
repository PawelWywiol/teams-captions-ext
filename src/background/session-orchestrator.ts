import { isDuplicate } from "../content/dedup.js";
import {
  upsertEntry,
  createSession,
  endSession,
  findActiveSessionForUrl,
  getRecentEntries,
  loadSession,
  putSession,
} from "../shared/db/index.js";
import type { StoredSession } from "../shared/db/schema.js";
import type { CaptionEntry, CaptionSession } from "../shared/types.js";

let activeSession: StoredSession | null = null;

async function resolveSessionForUrl(pageUrl: string): Promise<StoredSession> {
  if (activeSession && activeSession.pageUrl === pageUrl) {
    return activeSession;
  }

  if (activeSession && activeSession.pageUrl !== pageUrl) {
    await endSession(activeSession.id);
    activeSession = null;
  }

  const existing = await findActiveSessionForUrl(pageUrl);
  activeSession = existing ?? (await createSession(pageUrl));
  return activeSession;
}

export async function ingestCaption(pageUrl: string, entry: CaptionEntry): Promise<CaptionSession> {
  const session = await resolveSessionForUrl(pageUrl);
  // Window 20 covers the backlog of already-visible captions re-emitted with
  // fresh ids after a content-script re-inject.
  const recent = await getRecentEntries(session.id, 20);

  if (!isDuplicate(recent, entry, 20)) {
    await upsertEntry(session.id, entry);
  }

  let loaded = await loadSession(session.id);
  if (!loaded) {
    // The session row can vanish while entries keep persisting (seen with a
    // wedged IndexedDB); restore it from the in-memory copy instead of
    // failing every subsequent caption.
    await putSession(session);
    loaded = await loadSession(session.id);
  }
  if (!loaded) {
    throw new Error("Active session disappeared after write");
  }
  return loaded;
}

export async function getActiveSession(): Promise<CaptionSession | null> {
  if (!activeSession) return null;
  return loadSession(activeSession.id);
}

export function getActiveSessionId(): string | null {
  return activeSession?.id ?? null;
}

export async function stopActiveSession(): Promise<void> {
  if (!activeSession) return;
  await endSession(activeSession.id);
  activeSession = null;
}

export function resetForTesting(): void {
  activeSession = null;
}

import { isDuplicate } from "../content/dedup.js";
import {
  buildSession,
  createSession,
  endSession,
  getActiveSessionId,
  getRecentEntries,
  getSession,
  loadSession,
  putSession,
  setActiveSessionId,
  upsertEntry,
} from "../shared/db/index.js";
import type { StoredSession } from "../shared/db/schema.js";
import type { CaptionEntry, CaptionSession } from "../shared/types.js";

export async function createAndActivateSession(pageUrl: string): Promise<StoredSession> {
  const session = await createSession(pageUrl);
  await setActiveSessionId(session.id);
  return session;
}

export async function setActiveSession(sessionId: string): Promise<void> {
  await setActiveSessionId(sessionId);
}

async function resolveActiveSession(pageUrl: string): Promise<StoredSession> {
  const activeId = await getActiveSessionId();

  if (!activeId) {
    // No active session (fresh install, or the active session was deleted which
    // clears the pointer): auto-start one so captions are never dropped.
    return createAndActivateSession(pageUrl);
  }

  const active = await getSession(activeId);
  if (!active) {
    // The pointer is set but the row is gone (wedged IndexedDB): rebuild a stub
    // under the SAME id so entries already stored under it stay together. The
    // ingest recovery below persists it.
    return buildSession(pageUrl, activeId);
  }

  if (active.pageUrl !== pageUrl) {
    // Navigated to a different meeting: close the old one and auto-start a fresh
    // active session so transcripts from separate meetings don't get mixed.
    await endSession(active.id);
    return createAndActivateSession(pageUrl);
  }

  return active;
}

export async function ingestCaption(pageUrl: string, entry: CaptionEntry): Promise<CaptionSession> {
  const session = await resolveActiveSession(pageUrl);
  // Window 20 covers the backlog of already-visible captions re-emitted with
  // fresh ids after a content-script re-inject.
  const recent = await getRecentEntries(session.id, 20);

  if (!isDuplicate(recent, entry, 20)) {
    await upsertEntry(session.id, entry);
  }

  let loaded = await loadSession(session.id);
  if (!loaded) {
    // The session row can vanish while entries keep persisting (seen with a
    // wedged IndexedDB); restore it from the resolved copy instead of failing
    // every subsequent caption.
    await putSession(session);
    loaded = await loadSession(session.id);
  }
  if (!loaded) {
    throw new Error("Active session disappeared after write");
  }
  return loaded;
}

export async function getActiveSession(): Promise<CaptionSession | null> {
  const activeId = await getActiveSessionId();
  if (!activeId) return null;
  return loadSession(activeId);
}

export { getActiveSessionId };

export async function stopActiveSession(): Promise<void> {
  const activeId = await getActiveSessionId();
  if (!activeId) return;
  await endSession(activeId);
  await setActiveSessionId(null);
}

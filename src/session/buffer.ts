import { isDuplicate } from "../content/dedup.js";
import type { CaptionEntry, CaptionSession } from "../shared/types.js";

let currentSession: CaptionSession | null = null;

function createSession(pageUrl: string): CaptionSession {
  const now = new Date().toISOString();

  return {
    sessionId: crypto.randomUUID(),
    pageUrl,
    startedAt: now,
    updatedAt: now,
    entries: [],
  };
}

export function appendCaption(pageUrl: string, entry: CaptionEntry): CaptionSession {
  if (!currentSession || currentSession.pageUrl !== pageUrl) {
    currentSession = createSession(pageUrl);
  }

  if (!isDuplicate(currentSession.entries, entry)) {
    currentSession.entries.push(entry);
    currentSession.updatedAt = new Date().toISOString();
  }

  return currentSession;
}

export function getSession(): CaptionSession | null {
  return currentSession;
}

export function clearSession(): void {
  currentSession = null;
}

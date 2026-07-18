import { signal } from "@preact/signals";
import { useState } from "preact/hooks";
import {
  createPromptTemplate,
  deleteSession,
  renameSession,
  updateSession,
  watchActiveSessionId,
  watchAnalysisProgress,
  watchLatestSummary,
  watchPromptTemplates,
  watchSessionEntries,
  watchSessions,
} from "../../shared/db/index.js";
import type { StoredSession, StoredSummary } from "../../shared/db/schema.js";
import { sendRuntimeMessage } from "../../shared/messages.js";
import type { PopupState } from "../../shared/types.js";
import { AnalysisProgress } from "../shared/AnalysisProgress.js";
import { Button, EmptyState, Field, StatusBadge } from "../shared/primitives.js";
import { useLiveQuery } from "../shared/useLiveQuery.js";

const selectedId = signal<string | null>(null);
const query = signal("");
type Tab = "transcript" | "summary";
const activeTab = signal<Tab>("transcript");

function pickInitial(sessions: StoredSession[]): void {
  if (!sessions.length) {
    selectedId.value = null;
    return;
  }
  if (!selectedId.value || !sessions.find((s) => s.id === selectedId.value)) {
    selectedId.value = sessions[0]?.id ?? null;
  }
}

function formatDate(iso: string): string {
  return iso.slice(0, 16).replace("T", " ");
}

async function onNewSession(): Promise<void> {
  try {
    const next = await sendRuntimeMessage<PopupState>({ type: "CREATE_SESSION" });
    if (next.activeSessionId) selectedId.value = next.activeSessionId;
  } catch (error) {
    console.error("[teams-captions] new session failed", error);
  }
}

async function onSetActive(sessionId: string): Promise<void> {
  try {
    await sendRuntimeMessage<PopupState>({ type: "SET_ACTIVE_SESSION", payload: { sessionId } });
  } catch (error) {
    console.error("[teams-captions] set active failed", error);
  }
}

function openPrompts(): void {
  const url = browser.runtime.getURL("prompts/index.html");
  void browser.tabs.create({ url });
}

function SessionList({
  sessions,
  activeId,
}: {
  sessions: StoredSession[];
  activeId: string | null;
}): preact.JSX.Element {
  const q = query.value.trim().toLowerCase();
  const filtered = q
    ? sessions.filter(
        (s) => s.title.toLowerCase().includes(q) || s.pageUrl.toLowerCase().includes(q),
      )
    : sessions;

  if (!filtered.length) {
    return <EmptyState title="No sessions" description="Capture some captions to start." />;
  }

  return (
    <ul
      class="stack"
      style={{ listStyle: "none", padding: 0, margin: 0, overflow: "auto" }}
      data-testid="session-list"
    >
      {filtered.map((s) => {
        const selected = s.id === selectedId.value;
        const isActive = s.id === activeId;
        return (
          <li key={s.id}>
            <button
              type="button"
              onClick={() => {
                selectedId.value = s.id;
              }}
              style={{
                width: "100%",
                textAlign: "left",
                padding: "var(--space-3)",
                background: selected ? "var(--color-bg-elev)" : "transparent",
                borderColor: selected ? "var(--color-accent)" : "var(--color-border)",
              }}
            >
              <div class="row" style={{ justifyContent: "space-between", gap: "var(--space-2)" }}>
                <span style={{ fontWeight: 600 }}>{s.title}</span>
                {isActive ? <StatusBadge kind="capturing">Active</StatusBadge> : null}
              </div>
              <div class="muted" style={{ fontSize: "var(--text-xs)" }}>
                {formatDate(s.startedAt)}
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function Transcript({ sessionId }: { sessionId: string }): preact.JSX.Element {
  const entries = useLiveQuery(() => watchSessionEntries(sessionId), [sessionId]);
  const [copyState, setCopyState] = useState("");
  if (!entries) {
    return <p class="muted">Loading…</p>;
  }
  if (!entries.length) {
    return <EmptyState title="No captions yet" />;
  }

  async function copyTranscript(): Promise<void> {
    const text = entries!
      .map((e) => `${e.speakerResolved ?? e.speakerOriginal ?? "—"}: ${e.text}`)
      .join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopyState("Copied");
    } catch {
      setCopyState("Copy failed");
    }
    setTimeout(() => setCopyState(""), 1500);
  }

  return (
    <div class="stack">
      <div class="row">
        <Button onClick={copyTranscript} data-testid="copy-transcript">
          Copy transcript
        </Button>
        {copyState ? (
          <span class="muted" data-testid="transcript-copy-status">
            {copyState}
          </span>
        ) : null}
      </div>
      <ol
        class="stack"
        style={{ listStyle: "none", padding: 0, margin: 0, overflow: "auto" }}
        data-testid="transcript"
      >
        {entries.map((e) => (
          <li key={e.id} class="row" style={{ alignItems: "baseline" }}>
            <span class="muted" style={{ fontSize: "var(--text-xs)", minWidth: 64 }}>
              {e.ts.slice(11, 19)}
            </span>
            <strong style={{ minWidth: 120 }}>
              {e.speakerResolved ?? e.speakerOriginal ?? "—"}
            </strong>
            <span>{e.text}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function SummaryPanel({ session }: { session: StoredSession }): preact.JSX.Element {
  const sessionId = session.id;
  const [userPrompt, setUserPrompt] = useState(session.prompt ?? "");
  const [busy, setBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");
  const [copyState, setCopyState] = useState<"" | "Copied" | "Copy failed">("");
  const summary = useLiveQuery<StoredSummary | null>(
    () => watchLatestSummary(sessionId),
    [sessionId],
  );
  const progress = useLiveQuery(() => watchAnalysisProgress(sessionId), [sessionId]);
  const templates = useLiveQuery(() => watchPromptTemplates(), []) ?? [];
  const running = progress
    ? (["preparing", "mapping", "reducing"] as const).some((p) => p === progress.phase)
    : false;

  async function saveAsTemplate(): Promise<void> {
    const name = prompt("New prompt name");
    if (name == null || !name.trim()) return;
    try {
      await createPromptTemplate({ name, title: session.title, body: userPrompt });
      setStatusMsg("Saved as prompt");
    } catch (error) {
      setStatusMsg(error instanceof Error ? error.message : "Save failed");
    }
  }

  async function analyze(): Promise<void> {
    if (busy) return;
    setBusy(true);
    setStatusMsg("Analysing…");
    try {
      await updateSession(sessionId, { prompt: userPrompt });
      const result = await sendRuntimeMessage<PopupState>({
        type: "ANALYZE_SESSION",
        payload: { sessionId, prompt: userPrompt.trim() || undefined },
      });
      if (result.lastError) {
        setStatusMsg(result.lastError);
      } else {
        setStatusMsg("Done");
      }
    } catch (error) {
      setStatusMsg(error instanceof Error ? error.message : "Analysis failed");
    } finally {
      setBusy(false);
    }
  }

  async function copy(): Promise<void> {
    if (!summary?.content) return;
    try {
      await navigator.clipboard.writeText(summary.content);
      setCopyState("Copied");
    } catch {
      setCopyState("Copy failed");
    }
    setTimeout(() => setCopyState(""), 1500);
  }

  function applyTemplate(id: string): void {
    const template = templates.find((t) => t.id === id);
    if (!template) return;
    setUserPrompt(template.body);
    void updateSession(sessionId, { prompt: template.body });
    if (template.title.trim()) void updateSession(sessionId, { title: template.title });
  }

  return (
    <div class="stack">
      <Field
        label="Prompt template"
        htmlFor="summary-template"
        hint="Fills the prompt below. Editing here does not change the template."
      >
        <select
          id="summary-template"
          data-testid="summary-template-select"
          onChange={(e) => {
            const select = e.target as HTMLSelectElement;
            applyTemplate(select.value);
            select.value = "";
          }}
        >
          <option value="">— Select template —</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </Field>
      <Field
        label="Session Prompt"
        htmlFor="summary-prompt"
        hint="Saved with this session and appended to the default analysis prompt."
      >
        <textarea
          id="summary-prompt"
          rows={3}
          placeholder="e.g. Focus on action items and owners"
          value={userPrompt}
          onInput={(e) => setUserPrompt((e.target as HTMLTextAreaElement).value)}
          onBlur={() => void updateSession(sessionId, { prompt: userPrompt })}
        />
      </Field>
      <div class="row">
        <Button onClick={() => void saveAsTemplate()} data-testid="summary-save-template">
          Save as template
        </Button>
      </div>
      <div class="row">
        <Button variant="primary" onClick={analyze} disabled={busy || running}>
          {summary ? "Regenerate" : "Analyze"}
        </Button>
        <Button onClick={copy} disabled={!summary?.content}>
          Copy
        </Button>
        {statusMsg ? (
          <span class="muted" role="status">
            {statusMsg}
          </span>
        ) : null}
        {copyState ? (
          <span class="muted" data-testid="copy-status">
            {copyState}
          </span>
        ) : null}
      </div>
      <AnalysisProgress sessionId={sessionId} onResume={analyze} />
      {summary?.content ? (
        <>
          <div class="muted" style={{ fontSize: "var(--text-xs)" }}>
            Generated {formatDate(summary.createdAt)}
          </div>
          <textarea
            data-testid="summary-content"
            readOnly
            rows={16}
            value={summary.content}
            style={{ resize: "vertical", minHeight: "240px" }}
          />
        </>
      ) : (
        <EmptyState
          title={busy ? "Working…" : "No summary yet"}
          description={busy ? undefined : "Run Analyze to generate a summary."}
        />
      )}
    </div>
  );
}

function Tabs({
  value,
  onChange,
}: {
  value: Tab;
  onChange: (next: Tab) => void;
}): preact.JSX.Element {
  const items: Array<{ id: Tab; label: string }> = [
    { id: "transcript", label: "Transcript" },
    { id: "summary", label: "Summary" },
  ];
  return (
    <div class="row" role="tablist">
      {items.map((item) => (
        <Button
          key={item.id}
          variant={value === item.id ? "primary" : "ghost"}
          role="tab"
          aria-selected={value === item.id}
          onClick={() => onChange(item.id)}
        >
          {item.label}
        </Button>
      ))}
    </div>
  );
}

function SessionDetail({
  session,
  activeId,
}: {
  session: StoredSession;
  activeId: string | null;
}): preact.JSX.Element {
  const isActive = session.id === activeId;

  async function onRename(): Promise<void> {
    const next = prompt("Rename session", session.title);
    if (next == null) return;
    const trimmed = next.trim();
    if (!trimmed) return;
    try {
      await renameSession(session.id, trimmed);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Rename failed");
    }
  }

  async function onDelete(): Promise<void> {
    if (!confirm(`Delete "${session.title}"? This cannot be undone.`)) return;
    await deleteSession(session.id);
    selectedId.value = null;
  }

  return (
    <section class="stack" style={{ minWidth: 0 }}>
      <header class="row" style={{ justifyContent: "space-between" }}>
        <div>
          <h2 style={{ margin: 0 }}>{session.title}</h2>
          <div class="muted" style={{ fontSize: "var(--text-xs)" }}>
            {formatDate(session.startedAt)} · {session.pageUrl}
          </div>
        </div>
        <div class="row">
          <Button
            variant="primary"
            onClick={() => void onSetActive(session.id)}
            disabled={isActive}
            data-testid="set-active-btn"
          >
            {isActive ? "Active" : "Set active"}
          </Button>
          <Button onClick={onRename}>Rename</Button>
          <Button variant="danger" onClick={onDelete}>
            Delete
          </Button>
        </div>
      </header>

      <Tabs
        value={activeTab.value}
        onChange={(next) => {
          activeTab.value = next;
        }}
      />

      {activeTab.value === "transcript" ? (
        <Transcript sessionId={session.id} />
      ) : (
        <SummaryPanel key={session.id} session={session} />
      )}
    </section>
  );
}

export function App(): preact.JSX.Element {
  const sessions = useLiveQuery(() => watchSessions(), []);
  const activeId = useLiveQuery(() => watchActiveSessionId(), []) ?? null;
  if (sessions) pickInitial(sessions);

  const selected = sessions?.find((s) => s.id === selectedId.value) ?? null;

  return (
    <div
      class="stack"
      style={{
        height: "100vh",
        margin: 0,
        padding: "var(--space-4)",
        display: "grid",
        gridTemplateColumns: "320px 1fr",
        gap: "var(--space-4)",
      }}
    >
      <aside class="stack" style={{ minHeight: 0 }}>
        <div class="row" style={{ justifyContent: "space-between" }}>
          <h1 style={{ margin: 0, fontSize: "var(--text-lg)" }}>Sessions</h1>
          <div class="row">
            <Button onClick={openPrompts} data-testid="open-prompts-btn">
              Prompts
            </Button>
            <Button
              variant="primary"
              onClick={() => void onNewSession()}
              data-testid="new-session-btn"
            >
              New session
            </Button>
          </div>
        </div>
        <Field label="Search" htmlFor="sessions-search">
          <input
            id="sessions-search"
            type="search"
            placeholder="Title or URL"
            value={query.value}
            onInput={(e) => {
              query.value = (e.target as HTMLInputElement).value;
            }}
          />
        </Field>
        {sessions ? (
          <SessionList sessions={sessions} activeId={activeId} />
        ) : (
          <p class="muted">Loading…</p>
        )}
      </aside>
      <main class="stack" style={{ minHeight: 0 }}>
        {selected ? (
          <SessionDetail session={selected} activeId={activeId} />
        ) : (
          <EmptyState
            title="Select a session"
            description="Captured meetings appear in the list on the left."
          />
        )}
      </main>
    </div>
  );
}

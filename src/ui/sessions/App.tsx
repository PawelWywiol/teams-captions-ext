import { signal } from "@preact/signals";
import { useState } from "preact/hooks";
import {
  deleteSession,
  renameSession,
  watchLatestSummary,
  watchSessionEntries,
  watchSessions,
} from "../../shared/db/index.js";
import type { StoredSession, StoredSummary } from "../../shared/db/schema.js";
import { sendRuntimeMessage } from "../../shared/messages.js";
import type { PopupState } from "../../shared/types.js";
import { Button, EmptyState, Field } from "../shared/primitives.js";
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

function SessionList({ sessions }: { sessions: StoredSession[] }): preact.JSX.Element {
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
        const active = s.id === selectedId.value;
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
                background: active ? "var(--color-bg-elev)" : "transparent",
                borderColor: active ? "var(--color-accent)" : "var(--color-border)",
              }}
            >
              <div style={{ fontWeight: 600 }}>{s.title}</div>
              <div class="muted" style={{ fontSize: "var(--text-xs)" }}>
                {formatDate(s.startedAt)} · {s.endedAt ? "ended" : "active"}
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
  if (!entries) {
    return <p class="muted">Loading…</p>;
  }
  if (!entries.length) {
    return <EmptyState title="No captions yet" />;
  }
  return (
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
          <strong style={{ minWidth: 120 }}>{e.speakerResolved ?? e.speakerOriginal ?? "—"}</strong>
          <span>{e.text}</span>
        </li>
      ))}
    </ol>
  );
}

function SummaryPanel({ sessionId }: { sessionId: string }): preact.JSX.Element {
  const [userPrompt, setUserPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");
  const [copyState, setCopyState] = useState<"" | "Copied" | "Copy failed">("");
  const summary = useLiveQuery<StoredSummary | null>(
    () => watchLatestSummary(sessionId),
    [sessionId],
  );

  async function analyze(): Promise<void> {
    if (busy) return;
    setBusy(true);
    setStatusMsg("Analysing…");
    try {
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

  return (
    <div class="stack">
      <Field
        label="Custom Prompt"
        htmlFor="summary-prompt"
        hint="Appended to the default analysis prompt. Leave empty to use the default."
      >
        <textarea
          id="summary-prompt"
          rows={3}
          placeholder="e.g. Focus on action items and owners"
          value={userPrompt}
          onInput={(e) => setUserPrompt((e.target as HTMLTextAreaElement).value)}
        />
      </Field>
      <div class="row">
        <Button variant="primary" onClick={analyze} disabled={busy}>
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

function SessionDetail({ session }: { session: StoredSession }): preact.JSX.Element {
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
        <SummaryPanel sessionId={session.id} />
      )}
    </section>
  );
}

export function App(): preact.JSX.Element {
  const sessions = useLiveQuery(() => watchSessions(), []);
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
        <h1 style={{ margin: 0, fontSize: "var(--text-lg)" }}>Sessions</h1>
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
        {sessions ? <SessionList sessions={sessions} /> : <p class="muted">Loading…</p>}
      </aside>
      <main class="stack" style={{ minHeight: 0 }}>
        {selected ? (
          <SessionDetail session={selected} />
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

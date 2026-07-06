import { signal } from "@preact/signals";
import { useEffect } from "preact/hooks";
import { watchSessionEntries, watchSessions } from "../../shared/db/index.js";
import { sendRuntimeMessage } from "../../shared/messages.js";
import type {
  AnalyzeOptionsPayload,
  DiagnosticsView,
  ForceInjectResult,
  PopupState,
  RuntimeMessage,
} from "../../shared/types.js";
import { Button, EmptyState, Field, StatusBadge, Tabs } from "../shared/primitives.js";
import { statusKind, statusLabel } from "../shared/status.js";
import { useLiveQuery } from "../shared/useLiveQuery.js";

type TabId = "analyze" | "captions" | "debug";
const TAB_ITEMS = [
  { id: "analyze" as const, label: "Analyze" },
  { id: "captions" as const, label: "Captions" },
  { id: "debug" as const, label: "Debug" },
];
const DIAGNOSTICS_REFRESH_MS = 2500;

const popupState = signal<PopupState>({ status: "not_on_teams", entriesCount: 0 });
const diagnostics = signal<DiagnosticsView | null>(null);
const tab = signal<TabId>("analyze");
const titleInput = signal("");
const promptInput = signal("");
const includePrevious = signal(false);
const titleDirty = signal(false);
const promptDirty = signal(false);
const busy = signal(false);
const fetchingDiag = signal(false);
const injectResult = signal<ForceInjectResult | null>(null);
const injecting = signal(false);

async function runForceInject(): Promise<void> {
  if (injecting.value) return;
  injecting.value = true;
  try {
    injectResult.value = await send<ForceInjectResult>({ type: "FORCE_INJECT" });
    setTimeout(() => void refreshDiagnostics(), 800);
  } finally {
    injecting.value = false;
  }
}

async function send<T = unknown>(message: RuntimeMessage): Promise<T> {
  return sendRuntimeMessage<T>(message);
}

function applyPopupState(next: PopupState): void {
  popupState.value = next;
  if (next.defaults) {
    if (!titleDirty.value) titleInput.value = next.defaults.title;
    if (!promptDirty.value) promptInput.value = next.defaults.prompt;
  }
  if (next.hasPreviousSummary !== undefined && !includePrevious.peek() && next.hasPreviousSummary) {
    includePrevious.value = true;
  }
  if (!next.hasPreviousSummary) {
    includePrevious.value = false;
  }
}

async function refreshState(): Promise<void> {
  if (busy.value) return;
  busy.value = true;
  try {
    applyPopupState(await send<PopupState>({ type: "GET_POPUP_STATE" }));
  } finally {
    busy.value = false;
  }
}

async function refreshDiagnostics(): Promise<void> {
  if (fetchingDiag.value) return;
  fetchingDiag.value = true;
  try {
    diagnostics.value = await send<DiagnosticsView>({ type: "GET_DIAGNOSTICS" });
  } finally {
    fetchingDiag.value = false;
  }
}

async function runAnalyze(): Promise<void> {
  if (busy.value) return;
  busy.value = true;
  try {
    const payload: AnalyzeOptionsPayload = {
      prompt: promptInput.value.trim() || undefined,
      title: titleInput.value.trim() || undefined,
      includePrevious: includePrevious.value,
    };
    applyPopupState(await send<PopupState>({ type: "ANALYZE_CURRENT_SESSION", payload }));
  } finally {
    busy.value = false;
  }
}

async function clearResult(): Promise<void> {
  if (busy.value) return;
  busy.value = true;
  try {
    applyPopupState(await send<PopupState>({ type: "CLEAR_RESULT" }));
  } finally {
    busy.value = false;
  }
}

function openSessions(): void {
  const url = browser.runtime.getURL("sessions/index.html");
  void browser.tabs.create({ url });
}

function AnalyzeTab(): preact.JSX.Element {
  const { status, entriesCount, resultText, hasPreviousSummary } = popupState.value;
  const canAnalyze = !busy.value && entriesCount > 0 && status !== "analyzing";

  return (
    <div class="stack">
      <Field label="Title" htmlFor="popup-title" hint="Sent with the prompt to the LLM.">
        <input
          id="popup-title"
          data-testid="title-input"
          value={titleInput.value}
          onInput={(e) => {
            titleInput.value = (e.target as HTMLInputElement).value;
            titleDirty.value = true;
          }}
          placeholder="Meeting title"
        />
      </Field>

      <Field
        label="Prompt"
        htmlFor="popup-prompt"
        hint="Appended to the default analysis instructions."
      >
        <textarea
          id="popup-prompt"
          data-testid="prompt-input"
          rows={3}
          value={promptInput.value}
          onInput={(e) => {
            promptInput.value = (e.target as HTMLTextAreaElement).value;
            promptDirty.value = true;
          }}
          placeholder="Focus on action items, decisions, blockers…"
        />
      </Field>

      <label
        class="row"
        style={{ gap: "var(--space-2)", cursor: hasPreviousSummary ? "pointer" : "not-allowed" }}
      >
        <input
          type="checkbox"
          data-testid="include-previous"
          checked={includePrevious.value}
          disabled={!hasPreviousSummary}
          onChange={(e) => {
            includePrevious.value = (e.target as HTMLInputElement).checked;
          }}
          style={{ width: "auto" }}
        />
        <span class={hasPreviousSummary ? "" : "muted"}>
          Include previous summary
          {hasPreviousSummary ? "" : " (none yet)"}
        </span>
      </label>

      <div class="row">
        <Button
          variant="primary"
          onClick={runAnalyze}
          disabled={!canAnalyze}
          data-testid="analyze-btn"
        >
          {status === "analyzing" ? "Analyzing…" : "Analyze"}
        </Button>
        <Button onClick={openSessions}>Sessions</Button>
        <Button onClick={() => void browser.runtime.openOptionsPage()}>Settings</Button>
      </div>

      {resultText ? (
        <section class="stack">
          <div class="row" style={{ justifyContent: "space-between" }}>
            <strong>Summary</strong>
            <Button variant="ghost" onClick={clearResult}>
              Clear
            </Button>
          </div>
          <pre
            data-testid="result"
            style={{
              whiteSpace: "pre-wrap",
              fontFamily: "var(--font-mono)",
              background: "var(--color-bg-elev)",
              padding: "var(--space-3)",
              borderRadius: "var(--radius-2)",
              maxHeight: "240px",
              overflow: "auto",
              margin: 0,
            }}
          >
            {resultText}
          </pre>
        </section>
      ) : (
        <EmptyState
          title="No summary yet"
          description="Capture captions, then run Analyze to generate one."
        />
      )}
    </div>
  );
}

function CaptionLines({ sessionId }: { sessionId: string }): preact.JSX.Element {
  const entries = useLiveQuery(() => watchSessionEntries(sessionId), [sessionId]);
  if (!entries) {
    return <p class="muted">Loading…</p>;
  }
  if (!entries.length) {
    return <EmptyState title="No captions yet" />;
  }
  return (
    <ul
      class="stack"
      style={{ listStyle: "none", padding: 0, margin: 0, gap: "var(--space-2)" }}
      data-testid="captions-preview"
    >
      {entries.map((e) => (
        <li key={e.id} style={{ fontSize: "var(--text-sm)" }}>
          <strong>{e.speakerResolved ?? e.speakerOriginal ?? "—"}:</strong> {e.text}
        </li>
      ))}
    </ul>
  );
}

function CaptionsTab(): preact.JSX.Element {
  const sessions = useLiveQuery(() => watchSessions(), []);
  if (!sessions) {
    return <p class="muted">Loading…</p>;
  }
  const active = sessions[0];
  if (!active) {
    return (
      <EmptyState title="No captions yet" description="Open a Teams meeting and start captions." />
    );
  }
  return (
    <div class="stack">
      <CaptionLines sessionId={active.id} />
    </div>
  );
}

function DiagRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: preact.ComponentChildren;
  tone?: "ok" | "warn" | "bad";
}): preact.JSX.Element {
  const color =
    tone === "ok"
      ? "var(--color-success)"
      : tone === "bad"
        ? "var(--color-danger)"
        : tone === "warn"
          ? "var(--color-warning)"
          : "inherit";
  return (
    <div
      class="row"
      style={{ justifyContent: "space-between", gap: "var(--space-3)", alignItems: "flex-start" }}
    >
      <span class="muted" style={{ fontSize: "var(--text-xs)" }}>
        {label}
      </span>
      <span
        style={{
          fontFamily: "var(--font-mono)",
          color,
          textAlign: "right",
          wordBreak: "break-all",
        }}
      >
        {value}
      </span>
    </div>
  );
}

function PermissionHint({ diag }: { diag: DiagnosticsView }): preact.JSX.Element | null {
  if (diag.contentScriptLoaded) return null;
  return (
    <div
      class="status-badge is-error"
      role="alert"
      style={{ display: "block", padding: "var(--space-3)", lineHeight: 1.4 }}
    >
      <strong>Content script not running.</strong>
      <p class="muted" style={{ margin: "var(--space-1) 0 0" }}>
        Safari → Settings → Extensions → <em>Teams Captions Extension</em> → set BOTH{" "}
        <strong>teams.microsoft.com</strong> and <strong>teams.cloud.microsoft</strong> to{" "}
        <strong>Allow</strong> (or pick "On Every Website"). Then reload the Teams tab. If the
        domain is missing from the list, the extension manifest is out of date — rebuild and reload
        the temporary extension.
      </p>
    </div>
  );
}

function DebugTab(): preact.JSX.Element {
  const diag = diagnostics.value;
  if (!diag) {
    return <p class="muted">Loading diagnostics…</p>;
  }

  const cs = diag.contentScriptLoaded;
  return (
    <div class="stack" data-testid="debug-panel">
      <PermissionHint diag={diag} />

      <section
        class="stack"
        style={{
          gap: "var(--space-2)",
          padding: "var(--space-3)",
          background: "var(--color-bg-elev)",
          borderRadius: "var(--radius-2)",
        }}
      >
        <strong>Recovery (try this first)</strong>
        <p class="muted" style={{ margin: 0, fontSize: "var(--text-xs)" }}>
          Manually inject the content script into the active Teams tab. Use when content_scripts
          from the manifest aren't honored (common with Safari Temporary Extensions and lazy
          background workers).
        </p>
        <div class="row">
          <Button
            variant="primary"
            onClick={() => void runForceInject()}
            disabled={injecting.value}
            data-testid="force-inject"
          >
            {injecting.value ? "Injecting…" : "Force inject content script"}
          </Button>
        </div>
        {injectResult.value ? (
          <div class="stack" style={{ gap: "var(--space-2)" }}>
            <div
              class={`status-badge ${injectResult.value.ok ? "is-capturing" : "is-error"}`}
              role="status"
              style={{ display: "block", padding: "var(--space-2)" }}
            >
              <strong>{injectResult.value.ok ? "OK:" : "Failed:"}</strong>{" "}
              {injectResult.value.message}
              {injectResult.value.tabId !== undefined ? ` (tab ${injectResult.value.tabId})` : ""}
            </div>
            {injectResult.value.probe ? (
              <pre
                style={{
                  whiteSpace: "pre-wrap",
                  fontFamily: "var(--font-mono)",
                  fontSize: "var(--text-xs)",
                  background: "var(--color-bg)",
                  padding: "var(--space-2)",
                  borderRadius: "var(--radius-1)",
                  margin: 0,
                  maxHeight: "200px",
                  overflow: "auto",
                }}
                data-testid="inject-probe"
              >
                {JSON.stringify(injectResult.value.probe, null, 2)}
              </pre>
            ) : null}
          </div>
        ) : null}
      </section>

      <section class="stack" style={{ gap: "var(--space-2)" }}>
        <strong>Content script</strong>
        <DiagRow label="Loaded" value={cs ? "yes" : "no"} tone={cs ? "ok" : "bad"} />
        <DiagRow label="Teams page" value={diag.isTeamsPage ? "yes" : "no"} />
        <DiagRow
          label="Captions root"
          value={diag.captionsRootFound ? "found" : "missing"}
          tone={diag.captionsRootFound ? "ok" : "warn"}
        />
        <DiagRow
          label="Observer"
          value={diag.observerActive ? "active" : "off"}
          tone={diag.observerActive ? "ok" : "warn"}
        />
        <DiagRow label="Markers" value={diag.markersCount} />
        <DiagRow label="Text nodes" value={diag.textNodesCount} />
        <DiagRow label="Last entry" value={diag.lastEntryAt ?? "—"} />
        <DiagRow label="Last tick" value={diag.lastTickAt || "—"} />
        <DiagRow label="Received by bg" value={diag.receivedAt ?? "—"} />
        <DiagRow label="Page URL" value={diag.pageUrl || "—"} />
      </section>

      <section class="stack" style={{ gap: "var(--space-2)" }}>
        <strong>Session</strong>
        {diag.session ? (
          <>
            <DiagRow label="ID" value={diag.session.id.slice(0, 8)} />
            <DiagRow label="URL" value={diag.session.pageUrl} />
            <DiagRow label="Entries" value={diag.session.entriesCount} />
            <DiagRow label="Started" value={diag.session.startedAt} />
            <DiagRow label="Updated" value={diag.session.updatedAt} />
            <DiagRow label="Previous summary" value={diag.hasPreviousSummary ? "yes" : "no"} />
          </>
        ) : (
          <p class="muted">No active session.</p>
        )}
      </section>

      <section class="stack" style={{ gap: "var(--space-2)" }}>
        <strong>Recent captions (preview)</strong>
        {diag.recentTexts.length ? (
          <ul style={{ margin: 0, paddingLeft: "var(--space-4)" }}>
            {diag.recentTexts.map((p, i) => (
              <li key={i} style={{ fontSize: "var(--text-sm)" }}>
                <strong>{p.speaker}:</strong> {p.text}
              </li>
            ))}
          </ul>
        ) : (
          <p class="muted">No captions seen yet.</p>
        )}
      </section>

      <section class="stack" style={{ gap: "var(--space-2)" }}>
        <strong>Errors (last 5)</strong>
        {diag.lastErrors.length ? (
          <ul style={{ margin: 0, paddingLeft: "var(--space-4)" }}>
            {diag.lastErrors.map((e, i) => (
              <li key={i} style={{ fontSize: "var(--text-xs)" }}>
                <code>{e.scope}</code> · {e.at} · {e.message}
              </li>
            ))}
          </ul>
        ) : (
          <p class="muted">No errors recorded.</p>
        )}
      </section>

      <div class="row" style={{ justifyContent: "space-between" }}>
        <Button variant="ghost" onClick={() => void refreshDiagnostics()}>
          Refresh
        </Button>
        <span class="muted" style={{ fontSize: "var(--text-xs)" }}>
          ext {diag.extensionVersion}
        </span>
      </div>
    </div>
  );
}

export function App(): preact.JSX.Element {
  useEffect(() => {
    void refreshState();
    void refreshDiagnostics();
    const handle = setInterval(() => {
      void refreshState();
      if (tab.value === "debug") void refreshDiagnostics();
    }, DIAGNOSTICS_REFRESH_MS);
    return () => clearInterval(handle);
  }, []);

  const { status, entriesCount, lastError } = popupState.value;
  const kind = statusKind(status);

  return (
    <div class="popup stack" aria-busy={busy.value}>
      <header class="row" style={{ justifyContent: "space-between" }}>
        <StatusBadge kind={kind}>{statusLabel(status)}</StatusBadge>
        <span class="muted" data-testid="captions-count">
          {entriesCount} captions
        </span>
      </header>

      {lastError ? (
        <div class="status-badge is-error" role="alert">
          {lastError}
        </div>
      ) : null}

      <Tabs
        items={TAB_ITEMS}
        value={tab.value}
        onChange={(next) => {
          tab.value = next;
          if (next === "debug") void refreshDiagnostics();
        }}
      />

      {tab.value === "analyze" ? (
        <AnalyzeTab />
      ) : tab.value === "captions" ? (
        <CaptionsTab />
      ) : (
        <DebugTab />
      )}
    </div>
  );
}

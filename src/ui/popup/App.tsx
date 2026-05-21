import { signal } from "@preact/signals";
import { useEffect } from "preact/hooks";
import { sendRuntimeMessage } from "../../shared/messages.js";
import type { PopupState } from "../../shared/types.js";
import { Button, EmptyState, StatusBadge } from "../shared/primitives.js";
import { statusKind, statusLabel } from "../shared/status.js";

const popupState = signal<PopupState>({ status: "not_on_teams", entriesCount: 0 });
const busy = signal(false);

async function dispatch(
  type: "GET_POPUP_STATE" | "ANALYZE_CURRENT_SESSION" | "CLEAR_RESULT" | "STOP_CAPTURE",
): Promise<void> {
  if (busy.value) return;
  busy.value = true;
  try {
    popupState.value = await sendRuntimeMessage<PopupState>({ type });
  } finally {
    busy.value = false;
  }
}

function openSessions(): void {
  const url = browser.runtime.getURL("sessions/index.html");
  void browser.tabs.create({ url });
}

export function App(): preact.JSX.Element {
  useEffect(() => {
    void dispatch("GET_POPUP_STATE");
  }, []);

  const { status, entriesCount, lastError, resultText } = popupState.value;
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

      <div class="row">
        <Button
          variant="primary"
          onClick={() => dispatch("ANALYZE_CURRENT_SESSION")}
          disabled={busy.value || entriesCount === 0}
        >
          Analyze
        </Button>
        <Button onClick={openSessions}>Sessions</Button>
        <Button onClick={() => void browser.runtime.openOptionsPage()}>Settings</Button>
      </div>

      {resultText ? (
        <section class="stack">
          <div class="row" style={{ justifyContent: "space-between" }}>
            <strong>Summary</strong>
            <Button variant="ghost" onClick={() => dispatch("CLEAR_RESULT")}>
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

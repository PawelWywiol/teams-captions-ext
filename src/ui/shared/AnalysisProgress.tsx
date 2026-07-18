import { watchAnalysisProgress } from "../../shared/db/index.js";
import type { AnalysisPhase, StoredProgress } from "../../shared/db/schema.js";
import { sendRuntimeMessage } from "../../shared/messages.js";
import { Button } from "./primitives.js";
import { useLiveQuery } from "./useLiveQuery.js";

const STALE_MS = 150_000;
const ACTIVE_PHASES: AnalysisPhase[] = ["preparing", "mapping", "reducing"];
const PHASE_LABEL: Record<AnalysisPhase, string> = {
  preparing: "Preparing",
  mapping: "Analyzing sections",
  reducing: "Combining sections",
  done: "Done",
  error: "Failed",
  aborted: "Cancelled",
};

function percent(progress: StoredProgress): number {
  const steps = progress.totalChunks + 1;
  const completed = progress.completedChunks + (progress.phase === "done" ? 1 : 0);
  return steps > 0 ? Math.round((completed / steps) * 100) : 0;
}

export function AnalysisProgress({
  sessionId,
  onResume,
}: {
  sessionId: string;
  onResume?: () => void;
}): preact.JSX.Element | null {
  const progress = useLiveQuery(() => watchAnalysisProgress(sessionId), [sessionId]);
  if (!progress || progress.phase === "done") return null;

  const active = ACTIVE_PHASES.includes(progress.phase);
  const stale = active && Date.now() - Date.parse(progress.updatedAt) > STALE_MS;

  if (active && !stale) {
    const pct = percent(progress);
    const section = Math.max(progress.currentChunk, progress.completedChunks);
    return (
      <div class="stack" data-testid="analysis-progress" style={{ gap: "var(--space-2)" }}>
        <div class="row" style={{ justifyContent: "space-between" }}>
          <strong>Analysis in progress…</strong>
          <span class="muted">{pct}%</span>
        </div>
        <div
          style={{
            height: "6px",
            background: "var(--color-bg-elev)",
            borderRadius: "var(--radius-1)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${pct}%`,
              height: "100%",
              background: "var(--color-accent)",
            }}
          />
        </div>
        <div class="muted" style={{ fontSize: "var(--text-xs)" }}>
          Phase: {PHASE_LABEL[progress.phase]}
        </div>
        <div class="muted" style={{ fontSize: "var(--text-xs)" }}>
          Section {section} of {progress.totalChunks}
          {progress.cachedChunks > 0 ? ` (${progress.cachedChunks} cached)` : ""}
        </div>
        {progress.phase === "mapping" ? (
          <div class="muted" style={{ fontSize: "var(--text-xs)" }}>
            Sent: {progress.charsSent.toLocaleString()} / ~{progress.charsTotal.toLocaleString()} chars
          </div>
        ) : null}
        <div class="row">
          <Button
            variant="ghost"
            data-testid="cancel-analysis"
            onClick={() =>
              void sendRuntimeMessage({ type: "CANCEL_ANALYSIS", payload: { sessionId } })
            }
          >
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  const message = stale
    ? "Analysis interrupted (worker restarted)."
    : progress.phase === "aborted"
      ? "Analysis cancelled."
      : `Analysis failed: ${progress.error ?? "unknown error"}`;

  return (
    <div class="stack" data-testid="analysis-progress-ended" style={{ gap: "var(--space-2)" }}>
      <div class="status-badge is-error" role="status" style={{ display: "block" }}>
        {message}
      </div>
      {onResume ? (
        <div class="row">
          <Button variant="primary" data-testid="resume-analysis" onClick={onResume}>
            Resume
          </Button>
        </div>
      ) : null}
    </div>
  );
}

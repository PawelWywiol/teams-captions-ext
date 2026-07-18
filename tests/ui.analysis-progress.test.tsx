// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { liveQuery } from "dexie";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/preact";
import type { StoredProgress } from "../src/shared/db/schema.js";

let current: StoredProgress | null = null;
const sendRuntimeMessage = vi.fn(async () => ({ ok: true }));

vi.mock("../src/shared/db/index.js", () => ({
  watchAnalysisProgress: () => liveQuery(() => current),
}));
vi.mock("../src/shared/messages.js", () => ({
  sendRuntimeMessage: (...args: unknown[]) => sendRuntimeMessage(...(args as [])),
}));

function activeRow(): StoredProgress {
  return {
    sessionId: "s1",
    runId: "r1",
    phase: "mapping",
    totalChunks: 6,
    completedChunks: 3,
    cachedChunks: 2,
    currentChunk: 4,
    charsSent: 32100,
    charsTotal: 48000,
    updatedAt: new Date().toISOString(),
  };
}

describe("AnalysisProgress", () => {
  beforeEach(() => {
    current = null;
    sendRuntimeMessage.mockClear();
  });
  afterEach(() => cleanup());

  it("renders bar, section, volume, and a Cancel button while active", async () => {
    current = activeRow();
    const { AnalysisProgress } = await import("../src/ui/shared/AnalysisProgress.js");
    const { findByTestId, getByTestId, getByText } = render(<AnalysisProgress sessionId="s1" />);

    await findByTestId("analysis-progress");
    expect(getByText(/Section 4 of 6/)).toBeTruthy();
    expect(getByText(/2 cached/)).toBeTruthy();
    expect(getByText(/chars/)).toBeTruthy();

    fireEvent.click(getByTestId("cancel-analysis"));
    expect(sendRuntimeMessage).toHaveBeenCalledWith({
      type: "CANCEL_ANALYSIS",
      payload: { sessionId: "s1" },
    });
  });

  it("shows Resume for a stale active row", async () => {
    const row = activeRow();
    row.updatedAt = new Date(Date.now() - 200_000).toISOString();
    current = row;
    const onResume = vi.fn();
    const { AnalysisProgress } = await import("../src/ui/shared/AnalysisProgress.js");
    const { findByTestId, getByTestId } = render(
      <AnalysisProgress sessionId="s1" onResume={onResume} />,
    );

    await findByTestId("analysis-progress-ended");
    fireEvent.click(getByTestId("resume-analysis"));
    expect(onResume).toHaveBeenCalled();
  });

  it("shows the cancelled message and Resume for an aborted row", async () => {
    const row = activeRow();
    row.phase = "aborted";
    current = row;
    const onResume = vi.fn();
    const { AnalysisProgress } = await import("../src/ui/shared/AnalysisProgress.js");
    const { findByTestId, getByTestId, getByText } = render(
      <AnalysisProgress sessionId="s1" onResume={onResume} />,
    );

    await findByTestId("analysis-progress-ended");
    expect(getByText(/cancelled/i)).toBeTruthy();
    fireEvent.click(getByTestId("resume-analysis"));
    expect(onResume).toHaveBeenCalled();
  });
});

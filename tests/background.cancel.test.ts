// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RuntimeMessage } from "../src/shared/types.js";

type Listener = (
  message: RuntimeMessage,
  sender: unknown,
  sendResponse: (response?: unknown) => void,
) => unknown;

const capturedSignals: AbortSignal[] = [];

vi.mock("../src/shared/llm/orchestrator.js", () => ({
  analyzeSession: (_sessionId: string, _options: unknown, signal?: AbortSignal) => {
    if (signal) capturedSignals.push(signal);
    return new Promise((_resolve, reject) => {
      signal?.addEventListener("abort", () => reject(new DOMException("Analysis aborted", "AbortError")));
    });
  },
}));

describe("background CANCEL_ANALYSIS", () => {
  let listener: Listener | undefined;

  beforeEach(() => {
    vi.resetModules();
    listener = undefined;
    capturedSignals.length = 0;
    (globalThis as Record<string, unknown>).browser = {
      runtime: {
        onMessage: { addListener: (l: Listener) => { listener = l; } },
        getURL: (path: string) => `chrome-extension://test/${path}`,
        getManifest: () => ({ version: "0.1.0" }),
      },
      tabs: {},
      storage: {
        local: { get: vi.fn(() => Promise.resolve({})), set: vi.fn(() => Promise.resolve()) },
        session: { get: vi.fn(() => Promise.resolve({})), set: vi.fn(() => Promise.resolve()) },
      },
    };
  });

  afterEach(() => {
    delete (globalThis as Record<string, unknown>).browser;
    vi.restoreAllMocks();
  });

  it("aborts the active run for the session", async () => {
    await import("../src/background/index.js");
    const call = listener as Listener;

    call({ type: "ANALYZE_SESSION", payload: { sessionId: "sX" } }, {}, () => {});
    await vi.waitFor(() => expect(capturedSignals.length).toBe(1));
    expect(capturedSignals[0].aborted).toBe(false);

    call({ type: "CANCEL_ANALYSIS", payload: { sessionId: "sX" } }, {}, () => {});
    expect(capturedSignals[0].aborted).toBe(true);
  });

  it("marks orphaned active progress rows aborted at init", async () => {
    const { patchProgress, getProgress } = await import("../src/shared/db/index.js");
    await patchProgress("orphan", { phase: "mapping" });

    await import("../src/background/index.js");

    await vi.waitFor(async () => {
      expect((await getProgress("orphan"))?.phase).toBe("aborted");
    });
  });
});

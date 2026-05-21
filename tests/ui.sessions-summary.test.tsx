// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/preact";
import {
  appendEntry,
  createSession,
  getDb,
  saveSummary,
  setDbForTesting,
} from "../src/shared/db/index.js";
import { createDatabase } from "../src/shared/db/schema.js";
import type { CaptionEntry } from "../src/shared/types.js";

function makeEntry(text: string, ts: string): CaptionEntry {
  return {
    id: crypto.randomUUID(),
    ts,
    speakerOriginal: "Alice",
    text,
    source: "dom",
  };
}

function installBrowser(): void {
  (globalThis as Record<string, unknown>).browser = {
    runtime: {
      sendMessage: vi.fn(() =>
        Promise.resolve({ status: "result_ready", entriesCount: 0, resultText: "" }),
      ),
      openOptionsPage: vi.fn(() => Promise.resolve()),
      getURL: (p: string) => `chrome-extension://test/${p}`,
    },
    tabs: { create: vi.fn() },
  };
}

describe("sessions summary panel", () => {
  beforeEach(() => {
    installBrowser();
    const db = createDatabase(`sum-${crypto.randomUUID()}`);
    setDbForTesting(db);
  });

  afterEach(async () => {
    cleanup();
    const db = getDb();
    db.close();
    await indexedDB.deleteDatabase(db.name);
    setDbForTesting(null);
    delete (globalThis as Record<string, unknown>).browser;
    vi.restoreAllMocks();
  });

  it("renders stored summary as raw text and copies on Copy click", async () => {
    const session = await createSession("https://teams.microsoft.com/m/1");
    await appendEntry(session.id, makeEntry("hi", "2026-05-21T10:00:00.000Z"));
    await saveSummary({
      id: crypto.randomUUID(),
      sessionId: session.id,
      promptHash: "abc",
      content: "# Highlights\n- one\n- two",
      chunkHashes: ["x"],
      createdAt: new Date().toISOString(),
    });

    const writeText = vi.fn(() => Promise.resolve());
    Object.assign(navigator, { clipboard: { writeText } });

    const { App } = await import("../src/ui/sessions/App.js");
    const { container } = render(<App />);

    await waitFor(() => {
      expect(container.querySelector('[data-testid="session-list"]')).toBeTruthy();
    });

    const summaryTab = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "Summary",
    );
    fireEvent.click(summaryTab!);

    await waitFor(() => {
      const ta = container.querySelector<HTMLTextAreaElement>('[data-testid="summary-content"]');
      expect(ta?.value).toContain("# Highlights");
    });

    const copyButton = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "Copy",
    );
    fireEvent.click(copyButton!);

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith("# Highlights\n- one\n- two");
    });
    await waitFor(() => {
      const status = container.querySelector('[data-testid="copy-status"]');
      expect(status?.textContent).toBe("Copied");
    });
  });

  it("dispatches ANALYZE_SESSION with user prompt", async () => {
    const session = await createSession("https://teams.microsoft.com/m/2");
    await appendEntry(session.id, makeEntry("hi", "2026-05-21T10:00:00.000Z"));

    const sendMessage = vi.fn(() => Promise.resolve({ status: "result_ready", entriesCount: 1 }));
    (
      globalThis as unknown as { browser: { runtime: { sendMessage: typeof sendMessage } } }
    ).browser.runtime.sendMessage = sendMessage;

    const { App } = await import("../src/ui/sessions/App.js");
    const { container } = render(<App />);

    await waitFor(() => {
      expect(container.querySelector('[data-testid="session-list"]')).toBeTruthy();
    });

    const summaryTab = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "Summary",
    );
    fireEvent.click(summaryTab!);

    const prompt = container.querySelector<HTMLTextAreaElement>("#summary-prompt");
    fireEvent.input(prompt!, { target: { value: "focus on decisions" } });

    const analyzeButton = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "Analyze",
    );
    fireEvent.click(analyzeButton!);

    await waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith({
        type: "ANALYZE_SESSION",
        payload: { sessionId: session.id, prompt: "focus on decisions" },
      });
    });
  });
});

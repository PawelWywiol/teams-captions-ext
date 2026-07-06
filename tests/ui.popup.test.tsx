// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/preact";
import type { CaptionEntry, DiagnosticsView, PopupState } from "../src/shared/types.js";

function makeEntry(overrides: Partial<CaptionEntry> = {}): CaptionEntry {
  return {
    id: crypto.randomUUID(),
    ts: new Date().toISOString(),
    speakerOriginal: "Alice",
    text: "Hello world",
    source: "dom",
    ...overrides,
  };
}

type AnyMessage = { type: string; payload?: unknown };
type Handler = (m: AnyMessage) => Promise<unknown> | unknown;

const defaultState: PopupState = {
  status: "capturing",
  entriesCount: 7,
  hasPreviousSummary: false,
  defaults: { title: "Default title", prompt: "Default prompt" },
};

const defaultDiag: DiagnosticsView = {
  contentScriptLoaded: true,
  pageUrl: "https://teams.microsoft.com/x",
  isTeamsPage: true,
  captionsRootFound: true,
  observerActive: true,
  markersCount: 4,
  textNodesCount: 4,
  lastEntryAt: "2026-05-22T10:00:00.000Z",
  lastTickAt: "2026-05-22T10:00:02.000Z",
  lastErrors: [],
  recentTexts: [{ speaker: "Alice", text: "Hi team" }],
  receivedAt: "2026-05-22T10:00:02.500Z",
  session: {
    id: "abcdef0123",
    pageUrl: "https://teams.microsoft.com/x",
    startedAt: "2026-05-22T09:00:00.000Z",
    updatedAt: "2026-05-22T10:00:00.000Z",
    entriesCount: 7,
  },
  extensionVersion: "0.1.0",
  hasPreviousSummary: false,
};

function installBrowser(handler: Handler): void {
  (globalThis as Record<string, unknown>).browser = {
    runtime: {
      sendMessage: vi.fn((m: AnyMessage) => Promise.resolve(handler(m))),
      openOptionsPage: vi.fn(() => Promise.resolve()),
      getURL: (path: string) => `chrome-extension://test/${path}`,
    },
    tabs: { create: vi.fn(() => Promise.resolve()) },
  };
}

function makeHandler(
  overrides: Partial<{ state: PopupState; diag: DiagnosticsView }> = {},
): Handler {
  const state = { ...defaultState, ...overrides.state };
  const diag = { ...defaultDiag, ...overrides.diag };
  return (m) => {
    if (m.type === "GET_POPUP_STATE") return state;
    if (m.type === "GET_DIAGNOSTICS") return diag;
    if (m.type === "ANALYZE_CURRENT_SESSION")
      return { ...state, status: "result_ready", resultText: "Summary text" };
    if (m.type === "CLEAR_RESULT") return { ...state, resultText: undefined };
    return undefined;
  };
}

describe("popup app", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    cleanup();
    delete (globalThis as Record<string, unknown>).browser;
    vi.restoreAllMocks();
  });

  it("renders status, count, and prefills Title/Prompt from defaults", async () => {
    installBrowser(makeHandler());
    const { App } = await import("../src/ui/popup/App.js");
    const { container } = render(<App />);

    await waitFor(() => {
      expect(container.querySelector('[data-testid="captions-count"]')?.textContent).toBe(
        "7 captions",
      );
    });
    const title = container.querySelector('[data-testid="title-input"]') as HTMLInputElement;
    const prompt = container.querySelector('[data-testid="prompt-input"]') as HTMLTextAreaElement;
    expect(title.value).toBe("Default title");
    expect(prompt.value).toBe("Default prompt");
    expect(container.textContent).toContain("Capturing");
  });

  it("disables Analyze when no captions", async () => {
    installBrowser(
      makeHandler({ state: { ...defaultState, status: "on_teams", entriesCount: 0 } }),
    );
    const { App } = await import("../src/ui/popup/App.js");
    const { container } = render(<App />);

    await waitFor(() => {
      const analyze = container.querySelector('[data-testid="analyze-btn"]') as HTMLButtonElement;
      expect(analyze.disabled).toBe(true);
    });
  });

  it("sends Analyze payload with title, prompt, includePrevious flag", async () => {
    const captured: { value: AnyMessage | null } = { value: null };
    installBrowser((m) => {
      if (m.type === "ANALYZE_CURRENT_SESSION") {
        captured.value = m;
        return { ...defaultState, status: "result_ready", resultText: "out" };
      }
      if (m.type === "GET_POPUP_STATE") return { ...defaultState, hasPreviousSummary: true };
      if (m.type === "GET_DIAGNOSTICS") return defaultDiag;
      return undefined;
    });
    const { App } = await import("../src/ui/popup/App.js");
    const { container } = render(<App />);
    await waitFor(() =>
      expect(container.querySelector('[data-testid="analyze-btn"]')).toBeTruthy(),
    );

    const title = container.querySelector('[data-testid="title-input"]') as HTMLInputElement;
    const prompt = container.querySelector('[data-testid="prompt-input"]') as HTMLTextAreaElement;
    fireEvent.input(title, { target: { value: "Sprint review" } });
    fireEvent.input(prompt, { target: { value: "Focus on blockers" } });

    fireEvent.click(container.querySelector('[data-testid="analyze-btn"]') as HTMLButtonElement);

    await waitFor(() => expect(captured.value).not.toBeNull());
    expect(captured.value?.type).toBe("ANALYZE_CURRENT_SESSION");
    expect(captured.value?.payload).toEqual({
      title: "Sprint review",
      prompt: "Focus on blockers",
      includePrevious: true,
    });
  });

  it("opens sessions tab via browser.tabs.create", async () => {
    installBrowser(makeHandler());
    const { App } = await import("../src/ui/popup/App.js");
    const { container } = render(<App />);
    await waitFor(() =>
      expect(container.querySelector('[data-testid="captions-count"]')).toBeTruthy(),
    );

    const sessionsButton = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "Sessions",
    );
    fireEvent.click(sessionsButton!);

    const tabsCreate = (
      globalThis as unknown as { browser: { tabs: { create: ReturnType<typeof vi.fn> } } }
    ).browser.tabs.create;
    expect(tabsCreate).toHaveBeenCalledWith({
      url: "chrome-extension://test/sessions/index.html",
    });
  });

  it("Debug tab shows diagnostics + permission hint when content script not loaded", async () => {
    installBrowser(
      makeHandler({
        diag: {
          ...defaultDiag,
          contentScriptLoaded: false,
          captionsRootFound: false,
          observerActive: false,
        },
      }),
    );
    const { App } = await import("../src/ui/popup/App.js");
    const { container } = render(<App />);
    await waitFor(() => expect(container.querySelector('[data-testid="tabs"]')).toBeTruthy());

    const debugBtn = container.querySelector('[data-tab="debug"]') as HTMLButtonElement;
    fireEvent.click(debugBtn);

    await waitFor(() => {
      expect(container.querySelector('[data-testid="debug-panel"]')).toBeTruthy();
    });
    expect(container.textContent).toContain("Content script not running");
    expect(container.textContent).toContain("Safari → Settings → Extensions");
  });

  it("Captions tab lists captured captions of the active session", async () => {
    installBrowser(makeHandler());
    const db = await import("../src/shared/db/index.js");
    const { createDatabase } = await import("../src/shared/db/schema.js");
    db.setDbForTesting(createDatabase(`popup-${crypto.randomUUID()}`));
    try {
      const session = await db.createSession("https://teams.microsoft.com/meet/x");
      await db.appendEntry(
        session.id,
        makeEntry({ speakerOriginal: "Alice", text: "alpha line", ts: "2026-05-22T10:00:00.000Z" }),
      );
      await db.appendEntry(
        session.id,
        makeEntry({ speakerOriginal: "Bob", text: "beta line", ts: "2026-05-22T10:00:01.000Z" }),
      );

      const { App } = await import("../src/ui/popup/App.js");
      const { container } = render(<App />);
      await waitFor(() => expect(container.querySelector('[data-testid="tabs"]')).toBeTruthy());

      fireEvent.click(container.querySelector('[data-tab="captions"]') as HTMLButtonElement);

      await waitFor(() => {
        const preview = container.querySelector('[data-testid="captions-preview"]');
        expect(preview?.textContent).toContain("Alice");
        expect(preview?.textContent).toContain("alpha line");
        expect(preview?.textContent).toContain("Bob");
        expect(preview?.textContent).toContain("beta line");
      });
    } finally {
      const opened = db.getDb();
      opened.close();
      await indexedDB.deleteDatabase(opened.name);
      db.setDbForTesting(null);
    }
  });
});

// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/preact";

type MessageHandler = (message: { type: string }) => Promise<unknown> | unknown;

function installBrowser(handler: MessageHandler): void {
  (globalThis as Record<string, unknown>).browser = {
    runtime: {
      sendMessage: vi.fn((m) => Promise.resolve(handler(m))),
      openOptionsPage: vi.fn(() => Promise.resolve()),
      getURL: (path: string) => `chrome-extension://test/${path}`,
    },
    tabs: { create: vi.fn(() => Promise.resolve()) },
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

  it("renders status, count, and result on initial load", async () => {
    installBrowser(() =>
      Promise.resolve({
        status: "capturing",
        entriesCount: 7,
        resultText: "Summary text",
      }),
    );

    const { App } = await import("../src/ui/popup/App.js");
    const { container } = render(<App />);

    await waitFor(() => {
      expect(container.querySelector('[data-testid="captions-count"]')?.textContent).toBe(
        "7 captions",
      );
    });
    expect(container.querySelector('[data-testid="result"]')?.textContent).toBe("Summary text");
    expect(container.textContent).toContain("Capturing");
  });

  it("disables Analyze when no captions", async () => {
    installBrowser(() => Promise.resolve({ status: "on_teams", entriesCount: 0 }));
    const { App } = await import("../src/ui/popup/App.js");
    const { container } = render(<App />);

    await waitFor(() => {
      const analyze = Array.from(container.querySelectorAll("button")).find(
        (b) => b.textContent === "Analyze",
      );
      expect(analyze?.disabled).toBe(true);
    });
  });

  it("opens sessions tab via browser.tabs.create", async () => {
    installBrowser(() => Promise.resolve({ status: "on_teams", entriesCount: 0 }));
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
});

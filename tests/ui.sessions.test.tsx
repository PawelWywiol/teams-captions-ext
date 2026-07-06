// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/preact";
import { upsertEntry, createSession, getDb, setDbForTesting } from "../src/shared/db/index.js";
import { createDatabase } from "../src/shared/db/schema.js";
import type { CaptionEntry } from "../src/shared/types.js";

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

describe("sessions app", () => {
  beforeEach(() => {
    const db = createDatabase(`ui-sessions-${crypto.randomUUID()}`);
    setDbForTesting(db);
  });

  afterEach(async () => {
    cleanup();
    const db = getDb();
    db.close();
    await indexedDB.deleteDatabase(db.name);
    setDbForTesting(null);
    vi.restoreAllMocks();
  });

  it("lists sessions and shows their transcript when selected", async () => {
    const a = await createSession("https://teams.microsoft.com/meet/a");
    await upsertEntry(a.id, makeEntry({ text: "alpha", ts: "2026-05-21T10:00:00.000Z" }));
    await upsertEntry(a.id, makeEntry({ text: "beta", ts: "2026-05-21T10:00:01.000Z" }));

    const { App } = await import("../src/ui/sessions/App.js");
    const { container } = render(<App />);

    await waitFor(() => {
      const list = container.querySelector('[data-testid="session-list"]');
      expect(list?.textContent).toContain("teams.microsoft.com");
    });

    await waitFor(() => {
      const transcript = container.querySelector('[data-testid="transcript"]');
      expect(transcript?.textContent).toContain("alpha");
      expect(transcript?.textContent).toContain("beta");
    });
    expect(container.querySelector('[data-testid="copy-transcript"]')).toBeTruthy();
  });

  it("filters sessions by search query", async () => {
    const alpha = await createSession("https://teams.microsoft.com/meet/alpha");
    await createSession("https://teams.microsoft.com/meet/beta");

    const { App } = await import("../src/ui/sessions/App.js");
    const { container } = render(<App />);

    await waitFor(() => {
      const items = container.querySelectorAll('[data-testid="session-list"] li');
      expect(items.length).toBe(2);
    });

    const search = container.querySelector<HTMLInputElement>("#sessions-search");
    fireEvent.input(search!, { target: { value: alpha.pageUrl.slice(-5) } });

    await waitFor(() => {
      const items = container.querySelectorAll('[data-testid="session-list"] li');
      expect(items.length).toBe(1);
    });
  });
});

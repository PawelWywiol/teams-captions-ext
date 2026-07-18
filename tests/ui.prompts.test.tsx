// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/preact";
import {
  createPromptTemplate,
  getDb,
  listPromptTemplates,
  setDbForTesting,
} from "../src/shared/db/index.js";
import { createDatabase } from "../src/shared/db/schema.js";

describe("prompts app", () => {
  beforeEach(() => {
    setDbForTesting(createDatabase(`ui-prompts-${crypto.randomUUID()}`));
  });

  afterEach(async () => {
    cleanup();
    const db = getDb();
    db.close();
    await indexedDB.deleteDatabase(db.name);
    setDbForTesting(null);
    vi.restoreAllMocks();
  });

  it("lists templates and shows the editor for the selected one", async () => {
    await createPromptTemplate({ name: "Standup", title: "Daily", body: "blockers" });

    const { App } = await import("../src/ui/prompts/App.js");
    const { container } = render(<App />);

    await waitFor(() => {
      expect(container.querySelector('[data-testid="prompt-list"]')?.textContent).toContain(
        "Standup",
      );
    });
    const body = container.querySelector('[data-testid="prompt-body"]') as HTMLTextAreaElement;
    expect(body.value).toBe("blockers");
  });

  it("saves edits to a template", async () => {
    const t = await createPromptTemplate({ name: "Retro", body: "old" });

    const { App } = await import("../src/ui/prompts/App.js");
    const { container } = render(<App />);
    await waitFor(() =>
      expect(container.querySelector('[data-testid="prompt-body"]')).toBeTruthy(),
    );

    const body = container.querySelector('[data-testid="prompt-body"]') as HTMLTextAreaElement;
    fireEvent.input(body, { target: { value: "new body" } });
    fireEvent.click(container.querySelector('[data-testid="prompt-save"]') as HTMLButtonElement);

    await waitFor(async () => {
      const stored = (await listPromptTemplates()).find((x) => x.id === t.id);
      expect(stored?.body).toBe("new body");
    });
  });

  it("creates a new template via the New prompt button", async () => {
    vi.spyOn(window, "prompt").mockReturnValue("Fresh");

    const { App } = await import("../src/ui/prompts/App.js");
    const { container } = render(<App />);
    await waitFor(() =>
      expect(container.querySelector('[data-testid="new-prompt-btn"]')).toBeTruthy(),
    );

    fireEvent.click(container.querySelector('[data-testid="new-prompt-btn"]') as HTMLButtonElement);

    await waitFor(async () => {
      expect((await listPromptTemplates()).map((t) => t.name)).toContain("Fresh");
    });
  });

  it("deletes the selected template after confirmation", async () => {
    await createPromptTemplate({ name: "Doomed", body: "x" });
    vi.spyOn(window, "confirm").mockReturnValue(true);

    const { App } = await import("../src/ui/prompts/App.js");
    const { container } = render(<App />);
    await waitFor(() =>
      expect(container.querySelector('[data-testid="prompt-delete"]')).toBeTruthy(),
    );

    fireEvent.click(container.querySelector('[data-testid="prompt-delete"]') as HTMLButtonElement);

    await waitFor(async () => {
      expect(await listPromptTemplates()).toHaveLength(0);
    });
  });
});

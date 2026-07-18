import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clearProgress,
  getDb,
  getProgress,
  patchProgress,
  reconcileInterruptedAnalyses,
  setDbForTesting,
} from "../src/shared/db/index.js";
import { createDatabase } from "../src/shared/db/schema.js";

describe("analysis progress store", () => {
  beforeEach(() => {
    setDbForTesting(createDatabase(`prog-${crypto.randomUUID()}`));
  });

  afterEach(async () => {
    const db = getDb();
    db.close();
    await indexedDB.deleteDatabase(db.name);
    setDbForTesting(null);
  });

  it("creates a row with defaults and refreshes updatedAt on patch", async () => {
    await patchProgress("s1", { phase: "mapping", totalChunks: 3, charsTotal: 900 });
    const first = await getProgress("s1");
    expect(first?.phase).toBe("mapping");
    expect(first?.totalChunks).toBe(3);
    expect(first?.completedChunks).toBe(0);
    expect(first?.updatedAt).toBeTruthy();

    await patchProgress("s1", { completedChunks: 1, charsSent: 300 });
    const second = await getProgress("s1");
    expect(second?.completedChunks).toBe(1);
    expect(second?.totalChunks).toBe(3);
    expect(Date.parse(second!.updatedAt)).toBeGreaterThanOrEqual(Date.parse(first!.updatedAt));
  });

  it("clears a row", async () => {
    await patchProgress("s2", { phase: "done" });
    await clearProgress("s2");
    expect(await getProgress("s2")).toBeNull();
  });

  it("reconcile flips active rows to aborted, leaves terminal rows untouched", async () => {
    await patchProgress("active", { phase: "mapping" });
    await patchProgress("terminal", { phase: "done" });

    await reconcileInterruptedAnalyses();

    expect((await getProgress("active"))?.phase).toBe("aborted");
    expect((await getProgress("terminal"))?.phase).toBe("done");
  });
});

import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createPromptTemplate,
  deletePromptTemplate,
  getDb,
  getPromptTemplate,
  listPromptTemplates,
  setDbForTesting,
  updatePromptTemplate,
} from "../src/shared/db/index.js";
import { createDatabase } from "../src/shared/db/schema.js";

describe("prompt templates db", () => {
  beforeEach(() => {
    setDbForTesting(createDatabase(`test-prompts-${crypto.randomUUID()}`));
  });

  afterEach(async () => {
    const db = getDb();
    db.close();
    await indexedDB.deleteDatabase(db.name);
    setDbForTesting(null);
  });

  it("creates, lists, updates and deletes a template", async () => {
    const created = await createPromptTemplate({
      name: "Standup",
      title: "Daily Standup",
      body: "Focus on blockers",
    });
    expect(created.id).toBeTruthy();

    expect((await listPromptTemplates()).map((t) => t.name)).toEqual(["Standup"]);

    await updatePromptTemplate(created.id, { body: "Focus on decisions" });
    expect((await getPromptTemplate(created.id))?.body).toBe("Focus on decisions");

    await deletePromptTemplate(created.id);
    expect(await getPromptTemplate(created.id)).toBeNull();
  });

  it("rejects an empty name on create and update", async () => {
    await expect(createPromptTemplate({ name: "   " })).rejects.toThrow(/name/i);
    const t = await createPromptTemplate({ name: "Retro" });
    await expect(updatePromptTemplate(t.id, { name: " " })).rejects.toThrow(/name/i);
  });

  it("lists templates alphabetically by name", async () => {
    await createPromptTemplate({ name: "Zeta" });
    await createPromptTemplate({ name: "Alpha" });
    expect((await listPromptTemplates()).map((t) => t.name)).toEqual(["Alpha", "Zeta"]);
  });

  it("duplicating (create from existing values) yields an independent row", async () => {
    const original = await createPromptTemplate({ name: "Base", body: "shared body" });
    const copy = await createPromptTemplate({ name: "Base copy", body: original.body });
    await updatePromptTemplate(copy.id, { body: "changed" });
    expect((await getPromptTemplate(original.id))?.body).toBe("shared body");
    expect((await getPromptTemplate(copy.id))?.body).toBe("changed");
  });
});

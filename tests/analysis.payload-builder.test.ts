import { describe, expect, it } from "vitest";
import { buildAnalysisPayload } from "../src/analysis/payload-builder.js";
import type { CaptionSession, PluginSettings } from "../src/shared/types.js";

function makeSettings(overrides: Partial<PluginSettings> = {}): PluginSettings {
  return {
    apiBaseUrl: "http://127.0.0.1:8787",
    bearerToken: "test-token",
    provider: "copilot",
    customTitleDefault: "Weekly sync",
    extendedPromptDefault: "Focus on decisions and action items.",
    participantAliases: {
      "Jan Kowalski": "Jan",
    },
    ...overrides,
  };
}

function makeSession(): CaptionSession {
  return {
    sessionId: "session_1",
    pageUrl: "https://teams.example.test/meeting/1",
    startedAt: "2026-05-20T10:00:00.000Z",
    updatedAt: "2026-05-20T10:05:00.000Z",
    entries: [
      {
        id: "entry_1",
        ts: "2026-05-20T10:01:00.000Z",
        speakerOriginal: "Jan Kowalski",
        text: "We should ship on Friday.",
        source: "dom",
      },
      {
        id: "entry_2",
        ts: "2026-05-20T10:02:00.000Z",
        speakerOriginal: "Anna Nowak",
        text: "I will prepare the checklist.",
        source: "dom",
      },
    ],
  };
}

describe("buildAnalysisPayload", () => {
  it("builds normalized payload for proxy", () => {
    const payload = buildAnalysisPayload(makeSession(), makeSettings()) as {
      provider: string;
      messages: Array<{ role: string; content: string }>;
      metadata: Record<string, string>;
    };

    expect(payload.provider).toBe("copilot");
    expect(payload.messages).toHaveLength(2);
    expect(payload.messages[0]?.role).toBe("system");
    expect(payload.messages[1]?.role).toBe("user");
    expect(payload.metadata.client).toBe("teams-captions-ext");
  });

  it("includes title and prompt in user content", () => {
    const payload = buildAnalysisPayload(makeSession(), makeSettings()) as {
      messages: Array<{ role: string; content: string }>;
    };

    const userContent = payload.messages[1]?.content ?? "";

    expect(userContent).toContain("Title: Weekly sync");
    expect(userContent).toContain("Prompt: Focus on decisions and action items.");
  });

  it("resolves aliases in transcript block", () => {
    const payload = buildAnalysisPayload(makeSession(), makeSettings()) as {
      messages: Array<{ role: string; content: string }>;
    };

    const userContent = payload.messages[1]?.content ?? "";

    expect(userContent).toContain("Jan: We should ship on Friday.");
    expect(userContent).toContain("Anna Nowak: I will prepare the checklist.");
  });

  it("falls back to Untitled and default prompt", () => {
    const payload = buildAnalysisPayload(
      makeSession(),
      makeSettings({
        customTitleDefault: "",
        extendedPromptDefault: "",
      }),
    ) as {
      messages: Array<{ role: string; content: string }>;
    };

    const userContent = payload.messages[1]?.content ?? "";

    expect(userContent).toContain("Title: Untitled");
    expect(userContent).toContain("Prompt: Summarize key points.");
  });
});

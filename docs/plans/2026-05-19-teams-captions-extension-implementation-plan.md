# Teams Captions Extension Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Build a secure, testable, English-language Safari-first browser extension that captures Microsoft Teams browser captions, stores them durably by session, and generates incremental LLM summaries through `cli-llm-proxy` using user-provided prompt extensions.

**Architecture:** Use a WXT-based WebExtension codebase with TypeScript, React, and IndexedDB-backed persistence. A content script will observe Teams caption DOM nodes and normalize caption events into durable transcript sessions. A background service worker will orchestrate storage, summarization jobs, and communication with a local `cli-llm-proxy` service that is extended with session-aware incremental summarization endpoints.

**Tech Stack:** WXT, TypeScript, React, Safari Web Extension packaging, IndexedDB (via Dexie), Zod, Vitest, Playwright, Node.js, Fastify, SQLite, `cli-llm-proxy`.

---

## Grounded discoveries

- The provided sample HTML (`~/code/teams-captions-ext.html`) contains a stable Teams captions structure using:
  - `data-tid="closed-captions-v2-items-renderer"`
  - `data-tid="author"`
  - `data-tid="closed-caption-text"`
- The sample contains **25 caption entries** and **6 unique speakers**.
- The sample does **not** expose obvious timestamps in the clipped markup, so the extension should generate `capturedAt` timestamps locally when events are observed.
- Apple documents Safari Web Extensions as packaged app extensions, and WXT documents Safari as a supported target. Plan for a Safari wrapper/export path from the same codebase.
- Current machine state blocks immediate implementation work here: `node`, `npm`, `pnpm`, `gh`, `copilot`, and `xcodebuild` are unavailable in the current runtime. Planning can proceed; implementation will need tool bootstrap or a different machine image.

---

## Proposed repository layout

```text
teams-captions-ext/
  docs/
    plans/
      2026-05-19-teams-captions-extension-implementation-plan.md
    architecture/
      data-model.md
      threat-model.md
      llm-flow.md
  src/
    entrypoints/
      background.ts
      content.ts
      popup/
        App.tsx
        main.tsx
        index.html
      options/
        App.tsx
        main.tsx
        index.html
    components/
      SessionList.tsx
      TranscriptView.tsx
      SummaryPanel.tsx
      PromptEditor.tsx
      CaptureStatus.tsx
    features/
      capture/
        observer.ts
        extractor.ts
        dedupe.ts
        session-detector.ts
      storage/
        db.ts
        transcript-repo.ts
        summary-repo.ts
        settings-repo.ts
      summarization/
        client.ts
        chunking.ts
        incremental.ts
        prompts.ts
      export/
        markdown.ts
      shared/
        types.ts
        schemas.ts
        constants.ts
    test/
      fixtures/
        teams-captions-sample.html
      helpers/
        teams-dom.ts
  tests/
    unit/
    integration/
    e2e/
  wxt.config.ts
  package.json
  tsconfig.json
  README.md
```

```text
cli-llm-proxy/
  docs/
    architecture.md
    api-reference.md
    configuration.md
  src/
    plugins/
      sessions.ts
    routes/
      summaries.ts
    services/
      summary-store.ts
      transcript-optimizer.ts
      markdown-summary.ts
    storage/
      sqlite.ts
    types/
      summaries.ts
  tests/
    unit/
    integration/
```

---

## Data model

### Transcript event

```ts
export interface TranscriptEvent {
  id: string;
  sessionId: string;
  speakerName: string;
  text: string;
  capturedAt: string;
  source: "teams-web-captions";
  sourceSequence: number;
  fingerprint: string;
}
```

### Session

```ts
export interface TranscriptSession {
  id: string;
  source: "teams-web";
  meetingKey: string | null;
  title: string | null;
  startedAt: string;
  endedAt: string | null;
  lastCapturedAt: string;
  status: "active" | "idle" | "closed";
}
```

### Summary snapshot

```ts
export interface SummarySnapshot {
  id: string;
  sessionId: string;
  createdAt: string;
  basePrompt: string;
  userPrompt: string;
  coverage: {
    firstSequence: number;
    lastSequence: number;
    eventCount: number;
  };
  markdown: string;
  model: string;
}
```

### Incremental summary state

```ts
export interface SummaryCheckpoint {
  sessionId: string;
  lastSummarizedSequence: number;
  rollingSummaryMarkdown: string;
  updatedAt: string;
}
```

---

## Security constraints

1. Do not send raw captions anywhere unless the user explicitly requests summarization.
2. Default proxy host must be loopback only (`127.0.0.1`).
3. Require API key support for the proxy in non-dev flows.
4. Restrict content script execution to Teams domains only.
5. Sanitize markdown rendering in the extension UI.
6. Cap payload size and chunk transcript uploads to the proxy.
7. Add deletion flows for sessions and summaries.
8. Keep shell execution disabled in `cli-llm-proxy` (`shell: false`) and preserve current spawn safety.

---

## Summarization strategy

### Why incremental instead of full resend every time

Full transcript resend becomes slower and repeats the same analysis for long meetings. The better default is:

1. Maintain raw transcript events locally.
2. Maintain a rolling summary checkpoint per session.
3. On each new summary request:
   - fetch only transcript events after `lastSummarizedSequence`
   - chunk those events
   - ask LLM for:
     - delta summary
     - updated topics
     - decisions/actions/risks/open questions
   - merge delta into the rolling summary
4. If the user changes the prompt significantly or asks for a fresh global synthesis, allow a full recompute mode.

### Summary output shape

```md
# Session Summary

## Executive Summary

## Main Topics
- Topic A
- Topic B

## Decisions
- ...

## Action Items
| Owner | Task | Status | Evidence |
|---|---|---|---|

## Risks / Blockers

## Parking Lot

## Open Questions

## Chronological Notes
```

---

## Task plan

### Task 1: Capture current assumptions in repo docs

**Objective:** Create initial project documents so implementation starts from explicit constraints.

**Files:**
- Create: `README.md`
- Create: `docs/architecture/data-model.md`
- Create: `docs/architecture/threat-model.md`
- Create: `docs/architecture/llm-flow.md`
- Modify: `docs/plans/2026-05-19-teams-captions-extension-implementation-plan.md`

**Step 1: Write failing doc validation check**

Create a lightweight test script that asserts required docs exist.

```ts
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("project documentation", () => {
  it("contains required architecture docs", () => {
    expect(existsSync("docs/architecture/data-model.md")).toBe(true);
    expect(existsSync("docs/architecture/threat-model.md")).toBe(true);
    expect(existsSync("docs/architecture/llm-flow.md")).toBe(true);
  });
});
```

**Step 2: Run test to verify failure**

Run: `pnpm vitest run tests/unit/docs.test.ts`
Expected: FAIL — docs files do not exist.

**Step 3: Create minimal docs**

Add English docs describing selectors, storage model, privacy model, and incremental summary flow.

**Step 4: Run test to verify pass**

Run: `pnpm vitest run tests/unit/docs.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add README.md docs/ tests/unit/docs.test.ts
git commit -m "docs: add architecture baseline for teams captions extension"
```

---

### Task 2: Bootstrap the Safari-first extension app

**Objective:** Create the WXT extension skeleton with popup, options, background, and content entrypoints.

**Files:**
- Create: `package.json`
- Create: `wxt.config.ts`
- Create: `tsconfig.json`
- Create: `src/entrypoints/background.ts`
- Create: `src/entrypoints/content.ts`
- Create: `src/entrypoints/popup/App.tsx`
- Create: `src/entrypoints/popup/main.tsx`
- Create: `src/entrypoints/popup/index.html`
- Create: `src/entrypoints/options/App.tsx`
- Create: `src/entrypoints/options/main.tsx`
- Create: `src/entrypoints/options/index.html`
- Test: `tests/unit/bootstrap.test.ts`

**Step 1: Write failing test**

```ts
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("bootstrap", () => {
  it("defines extension entrypoints", () => {
    expect(existsSync("src/entrypoints/background.ts")).toBe(true);
    expect(existsSync("src/entrypoints/content.ts")).toBe(true);
    expect(existsSync("src/entrypoints/popup/App.tsx")).toBe(true);
    expect(existsSync("src/entrypoints/options/App.tsx")).toBe(true);
  });
});
```

**Step 2: Run test to verify failure**

Run: `pnpm vitest run tests/unit/bootstrap.test.ts`
Expected: FAIL.

**Step 3: Write minimal implementation**

- Initialize WXT project.
- Configure Teams host permissions only.
- Enable Safari target/export path.
- Add minimal popup/options UIs with placeholder copy.

**Step 4: Run test to verify pass**

Run: `pnpm vitest run tests/unit/bootstrap.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add .
git commit -m "feat: bootstrap WXT extension skeleton"
```

---

### Task 3: Add strict shared schemas and types

**Objective:** Define reliable contracts for sessions, transcript events, summaries, settings, and messages.

**Files:**
- Create: `src/features/shared/types.ts`
- Create: `src/features/shared/schemas.ts`
- Create: `src/features/shared/constants.ts`
- Test: `tests/unit/schemas.test.ts`

**Step 1: Write failing test**

```ts
import { describe, expect, it } from "vitest";
import { transcriptEventSchema } from "../../src/features/shared/schemas";

describe("transcriptEventSchema", () => {
  it("accepts a valid transcript event", () => {
    const result = transcriptEventSchema.safeParse({
      id: "evt_1",
      sessionId: "ses_1",
      speakerName: "Alice",
      text: "Hello",
      capturedAt: new Date().toISOString(),
      source: "teams-web-captions",
      sourceSequence: 1,
      fingerprint: "abc",
    });

    expect(result.success).toBe(true);
  });
});
```

**Step 2: Run test to verify failure**

Run: `pnpm vitest run tests/unit/schemas.test.ts`
Expected: FAIL.

**Step 3: Write minimal implementation**

Use Zod schemas for all extension-side payloads and runtime message contracts.

**Step 4: Run test to verify pass**

Run: `pnpm vitest run tests/unit/schemas.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/features/shared tests/unit/schemas.test.ts
git commit -m "feat: add shared schemas for transcript data"
```

---

### Task 4: Build caption extraction from known Teams DOM

**Objective:** Parse author/text pairs from the actual Teams closed-captions DOM shape proven by the sample HTML.

**Files:**
- Create: `src/features/capture/extractor.ts`
- Create: `src/test/fixtures/teams-captions-sample.html`
- Create: `src/test/helpers/teams-dom.ts`
- Test: `tests/unit/extractor.test.ts`

**Step 1: Write failing test**

```ts
import { describe, expect, it } from "vitest";
import { loadSampleTeamsDocument } from "../../src/test/helpers/teams-dom";
import { extractCaptionEntries } from "../../src/features/capture/extractor";

describe("extractCaptionEntries", () => {
  it("extracts author and caption text from Teams sample HTML", () => {
    const document = loadSampleTeamsDocument();
    const entries = extractCaptionEntries(document);

    expect(entries.length).toBeGreaterThan(0);
    expect(entries[0]).toMatchObject({
      speakerName: expect.any(String),
      text: expect.any(String),
    });
  });
});
```

**Step 2: Run test to verify failure**

Run: `pnpm vitest run tests/unit/extractor.test.ts`
Expected: FAIL.

**Step 3: Write minimal implementation**

Use the observed selectors:

```ts
const ROW_SELECTOR = '[data-tid="closed-captions-v2-items-renderer"]';
const AUTHOR_SELECTOR = '[data-tid="author"]';
const TEXT_SELECTOR = '[data-tid="closed-caption-text"]';
```

Do not rely on volatile generated class names.

**Step 4: Run test to verify pass**

Run: `pnpm vitest run tests/unit/extractor.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/features/capture src/test tests/unit/extractor.test.ts
git commit -m "feat: extract transcript entries from Teams captions DOM"
```

---

### Task 5: Add deduplication and sequencing

**Objective:** Prevent repeated storage of the same caption lines during DOM re-renders and virtual list churn.

**Files:**
- Create: `src/features/capture/dedupe.ts`
- Test: `tests/unit/dedupe.test.ts`

**Step 1: Write failing test**

```ts
import { describe, expect, it } from "vitest";
import { dedupeCaptionEvents } from "../../src/features/capture/dedupe";

describe("dedupeCaptionEvents", () => {
  it("removes duplicate speaker-text pairs seen in the same capture window", () => {
    const result = dedupeCaptionEvents([
      { speakerName: "Alice", text: "Hello" },
      { speakerName: "Alice", text: "Hello" },
    ]);

    expect(result).toHaveLength(1);
  });
});
```

**Step 2: Run test to verify failure**

Run: `pnpm vitest run tests/unit/dedupe.test.ts`
Expected: FAIL.

**Step 3: Write minimal implementation**

Fingerprint entries using normalized speaker, normalized text, and short rolling window context.

**Step 4: Run test to verify pass**

Run: `pnpm vitest run tests/unit/dedupe.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/features/capture/dedupe.ts tests/unit/dedupe.test.ts
git commit -m "feat: add caption deduplication"
```

---

### Task 6: Detect and manage transcript sessions

**Objective:** Group consecutive captions into sessions, support back-to-back meetings, and close idle sessions safely.

**Files:**
- Create: `src/features/capture/session-detector.ts`
- Test: `tests/unit/session-detector.test.ts`

**Step 1: Write failing test**

```ts
import { describe, expect, it } from "vitest";
import { SessionDetector } from "../../src/features/capture/session-detector";

describe("SessionDetector", () => {
  it("keeps captions in one session until idle timeout expires", () => {
    const detector = new SessionDetector({ idleMs: 5 * 60_000 });
    const first = detector.acceptCaptionAt("2026-01-01T10:00:00.000Z");
    const second = detector.acceptCaptionAt("2026-01-01T10:03:00.000Z");

    expect(first.sessionId).toBe(second.sessionId);
  });
});
```

**Step 2: Run test to verify failure**

Run: `pnpm vitest run tests/unit/session-detector.test.ts`
Expected: FAIL.

**Step 3: Write minimal implementation**

Session key strategy:
- Use meeting URL/context when available.
- Fallback to locally generated active session id.
- Start a new session when idle timeout expires or page/meeting identity changes.

**Step 4: Run test to verify pass**

Run: `pnpm vitest run tests/unit/session-detector.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/features/capture/session-detector.ts tests/unit/session-detector.test.ts
git commit -m "feat: group captions into durable sessions"
```

---

### Task 7: Persist sessions and summaries locally

**Objective:** Make transcripts and summaries survive tab closure and browser restarts.

**Files:**
- Create: `src/features/storage/db.ts`
- Create: `src/features/storage/transcript-repo.ts`
- Create: `src/features/storage/summary-repo.ts`
- Create: `src/features/storage/settings-repo.ts`
- Test: `tests/unit/storage.test.ts`

**Step 1: Write failing test**

```ts
import { describe, expect, it } from "vitest";
import { createTestDb, transcriptRepo } from "../../src/features/storage/db";

describe("transcriptRepo", () => {
  it("stores and reloads transcript events by session", async () => {
    const db = createTestDb();
    await transcriptRepo(db).add({
      id: "evt_1",
      sessionId: "ses_1",
      speakerName: "Alice",
      text: "Hello",
      capturedAt: new Date().toISOString(),
      source: "teams-web-captions",
      sourceSequence: 1,
      fingerprint: "fp1",
    });

    const events = await transcriptRepo(db).listBySession("ses_1");
    expect(events).toHaveLength(1);
  });
});
```

**Step 2: Run test to verify failure**

Run: `pnpm vitest run tests/unit/storage.test.ts`
Expected: FAIL.

**Step 3: Write minimal implementation**

Use IndexedDB/Dexie with stores for:
- `sessions`
- `events`
- `summaries`
- `checkpoints`
- `settings`

**Step 4: Run test to verify pass**

Run: `pnpm vitest run tests/unit/storage.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/features/storage tests/unit/storage.test.ts
git commit -m "feat: persist transcript sessions and summaries locally"
```

---

### Task 8: Build the live observer pipeline

**Objective:** Observe Teams caption DOM changes, extract new entries, dedupe them, assign session IDs, and persist them.

**Files:**
- Create: `src/features/capture/observer.ts`
- Modify: `src/entrypoints/content.ts`
- Test: `tests/integration/content-capture.test.ts`

**Step 1: Write failing test**

```ts
import { describe, expect, it } from "vitest";
import { createObserverHarness } from "../helpers/observer-harness";

describe("content capture pipeline", () => {
  it("persists new captions when Teams DOM mutates", async () => {
    const harness = await createObserverHarness();
    await harness.injectCaption({ speakerName: "Alice", text: "Hello" });

    expect(await harness.listEvents()).toHaveLength(1);
  });
});
```

**Step 2: Run test to verify failure**

Run: `pnpm vitest run tests/integration/content-capture.test.ts`
Expected: FAIL.

**Step 3: Write minimal implementation**

Use `MutationObserver`, a small debounce, and message passing to background/storage.

**Step 4: Run test to verify pass**

Run: `pnpm vitest run tests/integration/content-capture.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/entrypoints/content.ts src/features/capture/observer.ts tests/integration/content-capture.test.ts
git commit -m "feat: capture live teams captions via mutation observer"
```

---

### Task 9: Build popup session browser and transcript viewer

**Objective:** Let the user inspect sessions and transcript entries after the tab closes.

**Files:**
- Create: `src/components/SessionList.tsx`
- Create: `src/components/TranscriptView.tsx`
- Create: `src/components/CaptureStatus.tsx`
- Modify: `src/entrypoints/popup/App.tsx`
- Test: `tests/unit/popup-session-browser.test.tsx`

**Step 1: Write failing test**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "../../src/entrypoints/popup/App";

describe("popup session browser", () => {
  it("renders stored sessions", async () => {
    render(<App />);
    expect(await screen.findByText(/sessions/i)).toBeInTheDocument();
  });
});
```

**Step 2: Run test to verify failure**

Run: `pnpm vitest run tests/unit/popup-session-browser.test.tsx`
Expected: FAIL.

**Step 3: Write minimal implementation**

Show:
- active/closed sessions
- speaker + text transcript list
- basic counts and last activity time

**Step 4: Run test to verify pass**

Run: `pnpm vitest run tests/unit/popup-session-browser.test.tsx`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/components src/entrypoints/popup/App.tsx tests/unit/popup-session-browser.test.tsx
git commit -m "feat: add popup session browser"
```

---

### Task 10: Add delete and cleanup flows

**Objective:** Let the user remove transcripts and summaries safely.

**Files:**
- Modify: `src/features/storage/transcript-repo.ts`
- Modify: `src/features/storage/summary-repo.ts`
- Modify: `src/entrypoints/popup/App.tsx`
- Test: `tests/unit/delete-session.test.ts`

**Step 1: Write failing test**

```ts
import { describe, expect, it } from "vitest";
import { deleteSessionCascade } from "../../src/features/storage/transcript-repo";

describe("deleteSessionCascade", () => {
  it("deletes session, events, summaries, and checkpoints", async () => {
    const result = await deleteSessionCascade("ses_1");
    expect(result.deleted).toBe(true);
  });
});
```

**Step 2: Run test to verify failure**

Run: `pnpm vitest run tests/unit/delete-session.test.ts`
Expected: FAIL.

**Step 3: Write minimal implementation**

Implement cascade deletion with confirmation UI.

**Step 4: Run test to verify pass**

Run: `pnpm vitest run tests/unit/delete-session.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/features/storage src/entrypoints/popup/App.tsx tests/unit/delete-session.test.ts
git commit -m "feat: add transcript deletion workflow"
```

---

### Task 11: Add markdown summary editor/export UX

**Objective:** Let the user review, edit, copy, and reuse markdown summaries.

**Files:**
- Create: `src/components/SummaryPanel.tsx`
- Create: `src/components/PromptEditor.tsx`
- Create: `src/features/export/markdown.ts`
- Modify: `src/entrypoints/popup/App.tsx`
- Test: `tests/unit/summary-panel.test.tsx`

**Step 1: Write failing test**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SummaryPanel } from "../../src/components/SummaryPanel";

describe("SummaryPanel", () => {
  it("renders markdown summary and copy action", () => {
    render(<SummaryPanel markdown="# Hello" />);
    expect(screen.getByText("# Hello")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /copy/i })).toBeInTheDocument();
  });
});
```

**Step 2: Run test to verify failure**

Run: `pnpm vitest run tests/unit/summary-panel.test.tsx`
Expected: FAIL.

**Step 3: Write minimal implementation**

Allow:
- editable markdown textarea/editor
- copy to clipboard
- prompt extension input
- summary history selection

**Step 4: Run test to verify pass**

Run: `pnpm vitest run tests/unit/summary-panel.test.tsx`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/components src/features/export src/entrypoints/popup/App.tsx tests/unit/summary-panel.test.tsx
git commit -m "feat: add editable markdown summary workflow"
```

---

### Task 12: Extend cli-llm-proxy with persistent summary storage

**Objective:** Add durable server-side storage for summary checkpoints and summary snapshots.

**Files:**
- Create: `src/storage/sqlite.ts`
- Create: `src/services/summary-store.ts`
- Create: `src/types/summaries.ts`
- Test: `tests/unit/summary-store.test.ts`
- Modify: `docs/architecture.md`
- Modify: `docs/api-reference.md`

**Step 1: Write failing test**

```ts
import { describe, expect, it } from "vitest";
import { createSummaryStore } from "../../src/services/summary-store.js";

describe("summary store", () => {
  it("persists checkpoints by session", async () => {
    const store = await createSummaryStore(":memory:");
    await store.saveCheckpoint({
      sessionId: "ses_1",
      lastSummarizedSequence: 10,
      rollingSummaryMarkdown: "# Summary",
      updatedAt: new Date().toISOString(),
    });

    const checkpoint = await store.getCheckpoint("ses_1");
    expect(checkpoint?.lastSummarizedSequence).toBe(10);
  });
});
```

**Step 2: Run test to verify failure**

Run: `pnpm test -- tests/unit/summary-store.test.ts`
Expected: FAIL.

**Step 3: Write minimal implementation**

Add SQLite-backed persistence behind a storage abstraction. Keep in-memory mode for tests.

**Step 4: Run test to verify pass**

Run: `pnpm test -- tests/unit/summary-store.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/storage src/services src/types tests/unit/summary-store.test.ts docs/architecture.md docs/api-reference.md
git commit -m "feat: persist summary checkpoints in cli proxy"
```

---

### Task 13: Add proxy endpoints for summary generation

**Objective:** Provide explicit APIs for incremental and full summary generation from transcript batches.

**Files:**
- Create: `src/routes/summaries.ts`
- Create: `src/services/transcript-optimizer.ts`
- Create: `src/services/markdown-summary.ts`
- Modify: `src/server.ts`
- Modify: `docs/api-reference.md`
- Test: `tests/integration/summaries.test.ts`

**Step 1: Write failing test**

```ts
import { describe, expect, it } from "vitest";

describe("POST /v1/summaries", () => {
  it("returns markdown summary and coverage metadata", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/summaries",
      payload: {
        sessionId: "ses_1",
        mode: "incremental",
        events: [{ speakerName: "Alice", text: "Hello", sourceSequence: 1 }],
        userPrompt: "Focus on decisions",
      },
    });

    expect(response.statusCode).toBe(200);
  });
});
```

**Step 2: Run test to verify failure**

Run: `pnpm test -- tests/integration/summaries.test.ts`
Expected: FAIL.

**Step 3: Write minimal implementation**

Add endpoints:
- `POST /v1/summaries`
- `GET /v1/summaries/:sessionId`
- `DELETE /v1/summaries/:sessionId/:summaryId`

Response should include markdown and checkpoint metadata.

**Step 4: Run test to verify pass**

Run: `pnpm test -- tests/integration/summaries.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/routes src/services src/server.ts tests/integration/summaries.test.ts docs/api-reference.md
git commit -m "feat: add summary endpoints to cli proxy"
```

---

### Task 14: Implement transcript chunking and incremental merge rules

**Objective:** Make long conversations fast by summarizing only new transcript slices and merging deterministically.

**Files:**
- Create: `src/features/summarization/chunking.ts`
- Create: `src/features/summarization/incremental.ts`
- Modify: `src/services/transcript-optimizer.ts`
- Test: `tests/unit/chunking.test.ts`
- Test: `tests/unit/incremental-merge.test.ts`

**Step 1: Write failing tests**

```ts
import { describe, expect, it } from "vitest";
import { chunkTranscriptEvents } from "../../src/features/summarization/chunking";

describe("chunkTranscriptEvents", () => {
  it("creates stable chunks under token budget", () => {
    const chunks = chunkTranscriptEvents(makeEvents(200));
    expect(chunks.length).toBeGreaterThan(1);
  });
});
```

```ts
import { describe, expect, it } from "vitest";
import { mergeRollingSummary } from "../../src/features/summarization/incremental";

describe("mergeRollingSummary", () => {
  it("preserves prior topics and appends new decisions", () => {
    const merged = mergeRollingSummary(oldSummary, deltaSummary);
    expect(merged).toContain("Decisions");
  });
});
```

**Step 2: Run tests to verify failure**

Run: `pnpm vitest run tests/unit/chunking.test.ts tests/unit/incremental-merge.test.ts`
Expected: FAIL.

**Step 3: Write minimal implementation**

- chunk by approximate token budget and hard event count ceiling
- keep source sequence ranges per chunk
- merge by section-aware markdown rules
- support `incremental` and `full-refresh`

**Step 4: Run tests to verify pass**

Run: `pnpm vitest run tests/unit/chunking.test.ts tests/unit/incremental-merge.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/features/summarization src/services/transcript-optimizer.ts tests/unit/chunking.test.ts tests/unit/incremental-merge.test.ts
git commit -m "feat: optimize long-session summarization"
```

---

### Task 15: Add extension-to-proxy client integration

**Objective:** Connect the extension UI to the local `cli-llm-proxy` service securely.

**Files:**
- Create: `src/features/summarization/client.ts`
- Create: `src/features/summarization/prompts.ts`
- Modify: `src/entrypoints/popup/App.tsx`
- Test: `tests/integration/summary-request.test.tsx`

**Step 1: Write failing test**

```tsx
import { describe, expect, it } from "vitest";

describe("summary request flow", () => {
  it("sends only unsummarized events for incremental mode", async () => {
    const sent = await runSummaryRequestScenario();
    expect(sent.mode).toBe("incremental");
    expect(sent.events.length).toBeLessThan(totalEvents);
  });
});
```

**Step 2: Run test to verify failure**

Run: `pnpm vitest run tests/integration/summary-request.test.tsx`
Expected: FAIL.

**Step 3: Write minimal implementation**

- configurable proxy base URL
- API key support
- default system prompt + user prompt extension
- explicit user-triggered summarization button

**Step 4: Run test to verify pass**

Run: `pnpm vitest run tests/integration/summary-request.test.tsx`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/features/summarization src/entrypoints/popup/App.tsx tests/integration/summary-request.test.tsx
git commit -m "feat: connect extension to local summary proxy"
```

---

### Task 16: Add options page for settings and privacy controls

**Objective:** Let the user configure proxy URL, API key, idle timeout, and default prompt.

**Files:**
- Modify: `src/entrypoints/options/App.tsx`
- Modify: `src/features/storage/settings-repo.ts`
- Test: `tests/unit/options-settings.test.tsx`

**Step 1: Write failing test**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "../../src/entrypoints/options/App";

describe("options settings", () => {
  it("renders proxy and privacy settings", () => {
    render(<App />);
    expect(screen.getByLabelText(/proxy url/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/default prompt/i)).toBeInTheDocument();
  });
});
```

**Step 2: Run test to verify failure**

Run: `pnpm vitest run tests/unit/options-settings.test.tsx`
Expected: FAIL.

**Step 3: Write minimal implementation**

Expose:
- proxy base URL
- API key
- idle timeout
- full refresh toggle
- default prompt template
- delete all data button

**Step 4: Run test to verify pass**

Run: `pnpm vitest run tests/unit/options-settings.test.tsx`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/entrypoints/options/App.tsx src/features/storage/settings-repo.ts tests/unit/options-settings.test.tsx
git commit -m "feat: add extension settings and privacy controls"
```

---

### Task 17: Add end-to-end test coverage with fixture-based Teams page

**Objective:** Prove capture and summarization workflows work end-to-end against a deterministic Teams-like fixture.

**Files:**
- Create: `tests/e2e/capture-and-summary.spec.ts`
- Create: `tests/e2e/fixtures/teams-page.html`
- Modify: `package.json`

**Step 1: Write failing test**

```ts
import { test, expect } from "@playwright/test";

test("captures captions and creates markdown summary", async ({ page, context }) => {
  await page.goto("/tests/e2e/fixtures/teams-page.html");
  // load extension, inject fixture captions, request summary
  await expect(page.getByText("Session Summary")).toBeVisible();
});
```

**Step 2: Run test to verify failure**

Run: `pnpm playwright test tests/e2e/capture-and-summary.spec.ts`
Expected: FAIL.

**Step 3: Write minimal implementation**

Use a controlled HTML fixture plus mocked proxy responses.

**Step 4: Run test to verify pass**

Run: `pnpm playwright test tests/e2e/capture-and-summary.spec.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add tests/e2e package.json
git commit -m "test: add end-to-end coverage for capture and summary flow"
```

---

### Task 18: Document local development, Safari packaging, and operational setup

**Objective:** Make the project reproducible and testable by another engineer.

**Files:**
- Modify: `README.md`
- Create: `docs/development/setup.md`
- Create: `docs/development/testing.md`
- Create: `docs/development/safari-packaging.md`
- Modify: `cli-llm-proxy/README.md`
- Modify: `cli-llm-proxy/docs/deployment.md`

**Step 1: Write failing doc test**

```ts
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("development docs", () => {
  it("documents setup, testing, and safari packaging", () => {
    expect(existsSync("docs/development/setup.md")).toBe(true);
    expect(existsSync("docs/development/testing.md")).toBe(true);
    expect(existsSync("docs/development/safari-packaging.md")).toBe(true);
  });
});
```

**Step 2: Run test to verify failure**

Run: `pnpm vitest run tests/unit/development-docs.test.ts`
Expected: FAIL.

**Step 3: Write minimal implementation**

Document:
- prerequisites
- dev commands
- test commands
- Safari packaging via Xcode/export flow
- proxy configuration
- privacy expectations

**Step 4: Run test to verify pass**

Run: `pnpm vitest run tests/unit/development-docs.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add README.md docs/development tests/unit/development-docs.test.ts ../cli-llm-proxy/README.md ../cli-llm-proxy/docs/deployment.md
git commit -m "docs: add setup testing and safari packaging guides"
```

---

## Default prompts

### Extension-side default instruction

```text
Analyze the transcript and produce a structured markdown summary.
Group discussion into distinct topics even if speakers switch between them.
Track decisions, action items, blockers, open questions, and side topics.
When possible, infer owners from the speakers who committed to actions.
Preserve uncertainty explicitly instead of inventing facts.
Use concise bullet points and markdown tables when helpful.
```

### Incremental delta instruction

```text
You are updating an existing rolling summary of a meeting.
You will receive:
1. the current rolling summary
2. only the new transcript events since the last summary
3. an optional user prompt extension

Update the summary without repeating unchanged content.
Preserve previous decisions unless the new transcript clearly revises them.
Separate main topics from side topics.
Return markdown only.
```

---

## Verification checklist

Before calling the implementation complete:

- [ ] Teams caption extraction works against the provided sample HTML
- [ ] Selectors use stable `data-tid` hooks, not generated classes
- [ ] Captions persist after tab/browser restart
- [ ] Sessions split correctly across back-to-back meetings
- [ ] User can inspect, delete, copy, and edit summaries
- [ ] User can add a prompt extension for each summary request
- [ ] Incremental mode sends only unsummarized transcript ranges by default
- [ ] Full-refresh mode exists for prompt changes or fresh synthesis
- [ ] `cli-llm-proxy` stores checkpoints durably
- [ ] Proxy remains loopback-first and API-key capable
- [ ] Unit, integration, and e2e tests pass
- [ ] Safari packaging steps are documented

---

## Main risks

1. Teams may change DOM structure, so extraction needs a fallback selector strategy and fixture updates.
2. Safari packaging/testing requires Apple tooling not available in the current runtime.
3. Content scripts cannot access arbitrary localhost endpoints directly in every browser mode without proper permissions/CSP handling.
4. Incremental summary merging can drift over time; full-refresh mode is the safety valve.
5. Captions may contain sensitive information, so privacy UX and deletion need to be first-class.

---

## Unresolved questions

- Teams domains exact allowlist?
- Localhost proxy only, or remote option too?
- Summary model name default?
- Idle timeout for session split?
- Export only copy/paste, or file download too?
- Need speaker aliases/renaming?
- Need search/filter in transcript history?
- Need per-session custom title?

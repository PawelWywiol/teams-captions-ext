// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RuntimeMessage } from "../src/shared/types.js";

type Listener = (
  message: RuntimeMessage,
  sender: unknown,
  sendResponse: (response?: unknown) => void,
) => unknown;

// The background must answer via sendResponse + `return true` — Chrome only
// honors promise-returning onMessage listeners since version 146.
describe("background message bridge", () => {
  let listener: Listener | undefined;

  beforeEach(() => {
    vi.resetModules();
    listener = undefined;
    (globalThis as Record<string, unknown>).browser = {
      runtime: {
        onMessage: {
          addListener: (l: Listener) => {
            listener = l;
          },
        },
        getURL: (path: string) => `chrome-extension://test/${path}`,
        getManifest: () => ({ version: "0.1.0" }),
      },
      tabs: {},
      storage: {
        local: {
          get: vi.fn(() => Promise.resolve({})),
          set: vi.fn(() => Promise.resolve()),
        },
        session: {
          get: vi.fn(() => Promise.resolve({})),
          set: vi.fn(() => Promise.resolve()),
        },
      },
    };
  });

  afterEach(() => {
    delete (globalThis as Record<string, unknown>).browser;
    vi.restoreAllMocks();
  });

  async function loadListener(): Promise<Listener> {
    await import("../src/background/index.js");
    expect(listener).toBeDefined();
    return listener as Listener;
  }

  function callAndWait(message: RuntimeMessage): { returned: unknown; response: Promise<unknown> } {
    let resolve!: (value: unknown) => void;
    const response = new Promise<unknown>((r) => {
      resolve = r;
    });
    const returned = (listener as Listener)(message, {}, resolve);
    return { returned, response };
  }

  it("responds via sendResponse and keeps the channel open (returns true)", async () => {
    await loadListener();
    const { returned, response } = callAndWait({ type: "GET_POPUP_STATE" });

    expect(returned).toBe(true);
    const state = (await response) as { status: string; entriesCount: number };
    expect(state.status).toBeDefined();
    expect(typeof state.entriesCount).toBe("number");
  });

  it("creates and activates a session on CREATE_SESSION", async () => {
    await loadListener();
    const { response } = callAndWait({ type: "CREATE_SESSION" });

    const state = (await response) as { activeSessionId?: string; entriesCount: number };
    expect(state.activeSessionId).toBeTruthy();
    expect(state.entriesCount).toBe(0);

    const next = callAndWait({ type: "CREATE_SESSION" });
    const nextState = (await next.response) as { activeSessionId?: string };
    expect(nextState.activeSessionId).toBeTruthy();
    expect(nextState.activeSessionId).not.toBe(state.activeSessionId);
  });

  it("answers rejected handlers with an __error response instead of dropping them", async () => {
    await loadListener();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const { returned, response } = callAndWait({
      type: "CAPTION_ENTRY",
      // Broken payload forces the handler to throw.
      payload: undefined as never,
    });

    expect(returned).toBe(true);
    const result = (await response) as { __error?: string };
    expect(typeof result.__error).toBe("string");
    expect(consoleError).toHaveBeenCalled();
  });

  it("answers void handlers with an ok marker, never undefined", async () => {
    await loadListener();
    const { response } = callAndWait({
      type: "DIAGNOSTICS_REPORT",
      payload: { snapshot: {} as never },
    });

    expect(await response).toEqual({ ok: true });
  });
});

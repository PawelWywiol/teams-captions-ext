import { countEntries, getSession, latestSummary } from "../shared/db/index.js";
import { analyzeSession } from "../shared/llm/orchestrator.js";
import { loadSettings } from "../shared/storage.js";
import type {
  AnalyzeOptionsPayload,
  AnalyzeSessionPayload,
  BackgroundState,
  CaptionEntryMessagePayload,
  DiagnosticsReportPayload,
  DiagnosticsSessionInfo,
  DiagnosticsSnapshot,
  DiagnosticsView,
  ErrorResponse,
  ForceInjectProbe,
  ForceInjectResult,
  PageStatusMessagePayload,
  PluginStatus,
  PopupState,
  RuntimeMessage,
} from "../shared/types.js";
import {
  createAndActivateSession,
  getActiveSession,
  getActiveSessionId,
  ingestCaption,
  setActiveSession,
  stopActiveSession,
} from "./session-orchestrator.js";

console.log("[teams-captions] background started", new Date().toISOString());

const TEAMS_URL_PATTERNS = [
  "https://teams.microsoft.com/*",
  "https://*.teams.microsoft.com/*",
  "https://teams.cloud.microsoft/*",
  "https://*.teams.cloud.microsoft/*",
];
const TEAMS_HOSTS = ["teams.microsoft.com", "teams.cloud.microsoft"];
const injectedTabs = new Set<number>();

function isTeamsUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return TEAMS_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

let contentScriptText: string | null = null;
async function getContentScriptText(): Promise<string> {
  if (contentScriptText) return contentScriptText;
  const url = browser.runtime.getURL("content/index.js");
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url} → ${res.status}`);
  contentScriptText = await res.text();
  console.log("[teams-captions] cached content script", contentScriptText.length, "bytes");
  return contentScriptText;
}

async function injectViaText(tabId: number): Promise<{ ok: boolean; error?: string }> {
  if (!browser.scripting) return { ok: false, error: "scripting API unavailable" };
  try {
    const code = await getContentScriptText();
    const result = await browser.scripting.executeScript({
      target: { tabId },
      func: (sourceCode: string): { executed: boolean; error?: string } => {
        try {
          // Use Function ctor to run as fresh script in content script isolated world.
          // Safari MV3 ignores executeScript({files}) silently; this is the reliable path.
          new Function(sourceCode)();
          return { executed: true };
        } catch (e) {
          return { executed: false, error: e instanceof Error ? e.message : String(e) };
        }
      },
      args: [code],
    });
    const inner = result[0]?.result as { executed: boolean; error?: string } | undefined;
    if (inner?.executed) return { ok: true };
    return { ok: false, error: inner?.error ?? "unknown exec failure" };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function isContentScriptLoaded(tabId: number): Promise<boolean> {
  if (!browser.scripting) return false;
  try {
    const result = await browser.scripting.executeScript({
      target: { tabId },
      func: (): boolean =>
        Boolean((window as unknown as Record<string, unknown>)["__teamsCaptionsExtLoaded"]),
    });
    return result[0]?.result === true;
  } catch {
    return false;
  }
}

async function injectIntoTab(tabId: number): Promise<{ ok: boolean; error?: string }> {
  if (!browser.scripting) return { ok: false, error: "scripting API unavailable" };
  if (await isContentScriptLoaded(tabId)) return { ok: true };

  try {
    await browser.scripting.executeScript({ target: { tabId }, files: ["content/index.js"] });
  } catch (err) {
    console.warn("[teams-captions] files injection failed", tabId, err);
  }
  if (await isContentScriptLoaded(tabId)) return { ok: true };

  // Safari MV3 silently ignores executeScript({files}); run the script text in
  // the isolated world instead. Chromium blocks this eval path via CSP, but
  // there the files path above already works.
  return injectViaText(tabId);
}

async function injectContentScript(tabId: number, url: string | undefined): Promise<void> {
  if (!isTeamsUrl(url)) return;
  const result = await injectIntoTab(tabId);
  if (result.ok) {
    injectedTabs.add(tabId);
    console.log("[teams-captions] injected into tab", tabId, url);
  } else {
    console.warn("[teams-captions] injection failed", tabId, result.error);
  }
}

console.log("[teams-captions] tabs.onUpdated available?", !!browser.tabs.onUpdated);
console.log("[teams-captions] tabs.query available?", !!browser.tabs.query);
console.log("[teams-captions] scripting available?", !!browser.scripting);

if (browser.tabs.onUpdated) {
  browser.tabs.onUpdated.addListener((tabId, change, tab) => {
    if (change.status === "complete" && isTeamsUrl(tab.url ?? change.url)) {
      console.log("[teams-captions] onUpdated complete for tab", tabId, tab.url ?? change.url);
      void injectContentScript(tabId, tab.url ?? change.url);
    }
  });
}

async function forceInjectActiveTab(): Promise<ForceInjectResult> {
  if (!browser.tabs.query) {
    return { ok: false, message: "browser.tabs.query unavailable" };
  }
  if (!browser.scripting) {
    return { ok: false, message: "browser.scripting unavailable" };
  }
  try {
    const tabs = await browser.tabs.query({
      url: [
        "https://teams.microsoft.com/*",
        "https://*.teams.microsoft.com/*",
        "https://teams.cloud.microsoft/*",
        "https://*.teams.cloud.microsoft/*",
      ],
    });
    if (!tabs.length) {
      return { ok: false, message: "No Teams tab found" };
    }
    const tab = tabs[0];
    if (!tab || tab.id === undefined) {
      return { ok: false, message: "Tab has no id" };
    }
    const inject = await injectIntoTab(tab.id);
    console.log("[teams-captions] force-inject tab", tab.id, tab.url, inject);
    if (!inject.ok) {
      return {
        ok: false,
        message: `inject failed: ${inject.error}`,
        tabId: tab.id,
        tabUrl: tab.url,
      };
    }

    let probe: ForceInjectProbe | undefined;
    try {
      const probeResult = await browser.scripting.executeScript({
        target: { tabId: tab.id },
        func: (): ForceInjectProbe => {
          try {
            const winAny = window as unknown as Record<string, unknown>;
            const body = document.body as HTMLElement | null;
            return {
              sentinelSet: Boolean(winAny["__teamsCaptionsExtLoaded"]),
              bodyDatasetLoaded: body?.dataset?.tceLoaded ?? null,
              bodyDatasetHref: body?.dataset?.tceHref ?? null,
              htmlDatasetLoaded: document.documentElement.dataset.tceLoaded ?? null,
              documentReadyState: document.readyState,
              hasBody: !!body,
              markersInDom: document.querySelectorAll(
                '[data-tid="closed-captions-v2-items-renderer"]',
              ).length,
              textNodesInDom: document.querySelectorAll('[data-tid="closed-caption-text"]').length,
              ts: Date.now(),
            };
          } catch (e) {
            return {
              sentinelSet: false,
              bodyDatasetLoaded: null,
              bodyDatasetHref: null,
              htmlDatasetLoaded: null,
              documentReadyState: "?",
              hasBody: false,
              markersInDom: 0,
              textNodesInDom: 0,
              ts: Date.now(),
              error: e instanceof Error ? e.message : String(e),
            };
          }
        },
      });
      probe = probeResult[0]?.result as ForceInjectProbe | undefined;
      console.log("[teams-captions] probe result", probe);
    } catch (err) {
      console.warn("[teams-captions] probe failed", err);
    }

    return { ok: true, message: "Injected", tabId: tab.id, tabUrl: tab.url, probe };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn("[teams-captions] force-inject failed", message);
    return { ok: false, message };
  }
}

async function injectIntoOpenTabs(): Promise<void> {
  if (!browser.tabs.query) return;
  try {
    const tabs = await browser.tabs.query({ url: TEAMS_URL_PATTERNS });
    for (const t of tabs) {
      if (t.id !== undefined) void injectContentScript(t.id, t.url);
    }
  } catch (err) {
    console.warn("[teams-captions] tabs.query failed", err);
  }
}
void injectIntoOpenTabs();

const EXTENSION_VERSION =
  (typeof browser !== "undefined" &&
    (
      browser as unknown as { runtime?: { getManifest?: () => { version: string } } }
    ).runtime?.getManifest?.()?.version) ||
  "0.0.0";

const state: BackgroundState = {
  status: "not_on_teams",
  session: null,
  resultText: "",
  lastError: "",
};

let latestDiagnostics: DiagnosticsSnapshot | null = null;
let latestDiagnosticsAt: string | null = null;

async function loadDefaults(sessionId: string | null): Promise<{ title: string; prompt: string }> {
  const settings = await loadSettings();
  const session = sessionId ? await getSession(sessionId) : null;
  return {
    title: session?.title ?? settings.customTitleDefault,
    prompt: session?.prompt ?? settings.extendedPromptDefault,
  };
}

async function hasPreviousSummaryFor(sessionId: string | null): Promise<boolean> {
  if (!sessionId) return false;
  return !!(await latestSummary(sessionId));
}

async function getPopupState(): Promise<PopupState> {
  const sessionId = await getActiveSessionId();
  const entriesCount = sessionId ? await countEntries(sessionId) : 0;
  const defaults = await loadDefaults(sessionId);
  return {
    status: state.status,
    entriesCount,
    lastError: state.lastError || undefined,
    resultText: state.resultText || undefined,
    hasPreviousSummary: await hasPreviousSummaryFor(sessionId),
    activeSessionId: sessionId ?? undefined,
    defaults,
  };
}

async function buildSessionInfo(): Promise<DiagnosticsSessionInfo | null> {
  const session = await getActiveSession();
  if (!session) return null;
  return {
    id: session.sessionId,
    pageUrl: session.pageUrl,
    startedAt: session.startedAt,
    updatedAt: session.updatedAt,
    entriesCount: session.entries.length,
  };
}

async function getDiagnosticsView(): Promise<DiagnosticsView> {
  const session = await buildSessionInfo();
  const snapshot: DiagnosticsSnapshot = latestDiagnostics ?? {
    contentScriptLoaded: false,
    pageUrl: "",
    isTeamsPage: false,
    captionsRootFound: false,
    observerActive: false,
    markersCount: 0,
    textNodesCount: 0,
    lastEntryAt: null,
    lastTickAt: "",
    lastErrors: [],
    recentTexts: [],
  };
  return {
    ...snapshot,
    receivedAt: latestDiagnosticsAt,
    session,
    extensionVersion: EXTENSION_VERSION,
    hasPreviousSummary: await hasPreviousSummaryFor(session?.id ?? null),
  };
}

async function analyze(sessionId: string, options: AnalyzeOptionsPayload): Promise<PopupState> {
  state.status = "analyzing";
  state.lastError = "";
  try {
    // Per-session title/prompt drive the summary; the payload only overrides
    // them for this one run (e.g. an unsaved edit in the box).
    const session = await getSession(sessionId);
    const result = await analyzeSession(sessionId, {
      userPrompt: options.prompt ?? session?.prompt,
      title: options.title ?? session?.title,
      includePrevious: options.includePrevious,
    });
    state.status = "result_ready";
    state.resultText = result.summary.content;
    return getPopupState();
  } catch (error) {
    state.status = "error";
    state.lastError = error instanceof Error ? error.message : "Unexpected error";
    return getPopupState();
  }
}

async function analyzeCurrentSession(
  payload: AnalyzeOptionsPayload | undefined,
): Promise<PopupState> {
  const sessionId = await getActiveSessionId();
  if (!sessionId) {
    state.status = "error";
    state.lastError = "No active session";
    return getPopupState();
  }
  return analyze(sessionId, payload ?? {});
}

async function analyzeArbitrarySession(payload: AnalyzeSessionPayload): Promise<PopupState> {
  return analyze(payload.sessionId, payload);
}

async function currentPageUrl(fallback: string | undefined): Promise<string> {
  const active = await getActiveSession();
  return fallback ?? active?.pageUrl ?? latestDiagnostics?.pageUrl ?? "";
}

async function handleCreateSession(payload: { pageUrl?: string } | undefined): Promise<PopupState> {
  await createAndActivateSession(await currentPageUrl(payload?.pageUrl));
  state.resultText = "";
  state.lastError = "";
  return getPopupState();
}

async function handleSetActiveSession(payload: { sessionId: string }): Promise<PopupState> {
  await setActiveSession(payload.sessionId);
  state.resultText = "";
  state.lastError = "";
  return getPopupState();
}

async function handlePageStatus(payload: PageStatusMessagePayload): Promise<PopupState> {
  // The active session is explicit now; navigating away no longer ends it here.
  // The caption ingest path auto-switches when the meeting URL changes.
  state.status = payload.status;
  state.lastError = "";
  return getPopupState();
}

async function handleCaptionEntry(payload: CaptionEntryMessagePayload): Promise<void> {
  state.session = await ingestCaption(payload.pageUrl, payload.entry);
  state.status = "capturing";
}

function handleDiagnosticsReport(payload: DiagnosticsReportPayload): { ok: true } {
  latestDiagnostics = payload.snapshot;
  latestDiagnosticsAt = new Date().toISOString();
  return { ok: true };
}

async function handleClearResult(): Promise<PopupState> {
  state.resultText = "";
  state.lastError = "";
  const fallback: PluginStatus = (await getActiveSessionId()) ? "capturing" : "on_teams";
  state.status = fallback;
  return getPopupState();
}

async function handleStopCapture(): Promise<PopupState> {
  await stopActiveSession();
  state.session = null;
  state.resultText = "";
  state.lastError = "";
  state.status = "on_teams";
  return getPopupState();
}

function routeMessage(message: RuntimeMessage): Promise<unknown> {
  switch (message.type) {
    case "GET_POPUP_STATE":
      return getPopupState();

    case "GET_SETTINGS":
      return loadSettings();

    case "GET_DIAGNOSTICS":
      return getDiagnosticsView();

    case "PAGE_STATUS":
      return handlePageStatus(message.payload);

    case "CAPTION_ENTRY":
      return handleCaptionEntry(message.payload);

    case "DIAGNOSTICS_REPORT":
      return Promise.resolve(handleDiagnosticsReport(message.payload));

    case "ANALYZE_CURRENT_SESSION":
      return analyzeCurrentSession(message.payload);

    case "ANALYZE_SESSION":
      return analyzeArbitrarySession(message.payload);

    case "CREATE_SESSION":
      return handleCreateSession(message.payload);

    case "SET_ACTIVE_SESSION":
      return handleSetActiveSession(message.payload);

    case "CLEAR_RESULT":
      return handleClearResult();

    case "STOP_CAPTURE":
      return handleStopCapture();

    case "FORCE_INJECT":
      return forceInjectActiveTab();

    default:
      return Promise.resolve();
  }
}

// Explicit sendResponse + `return true` instead of returning the promise:
// Chrome only honors promise-returning onMessage listeners since 146, and a
// dropped response leaves the popup silently dead.
browser.runtime.onMessage.addListener(
  (message: RuntimeMessage, _sender, sendResponse: (response: unknown) => void) => {
    // Void handlers (e.g. CAPTION_ENTRY) resolve to undefined; answer with a
    // marker object so senders can distinguish "handled" from "no listener".
    routeMessage(message).then(
      (result) => sendResponse(result ?? { ok: true }),
      (error) => {
        console.error("[teams-captions] handler failed", message.type, error);
        sendResponse({
          __error: error instanceof Error ? error.message : String(error),
        } satisfies ErrorResponse);
      },
    );
    return true;
  },
);

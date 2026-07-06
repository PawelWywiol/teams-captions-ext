import { sendRuntimeMessage } from "../shared/messages.js";
import type { DiagnosticsError, DiagnosticsSnapshot, PluginStatus } from "../shared/types.js";
import { DomCaptionSource } from "./dom-source.js";

const SENTINEL = "__teamsCaptionsExtLoaded";
type WindowWithSentinel = Window & { [SENTINEL]?: boolean };
const w = window as WindowWithSentinel;

const PREVIEW_LIMIT = 3;
const ERROR_LIMIT = 5;
const TICK_MS = 2000;
const PREVIEW_TEXT_MAX = 80;

const recentPreviews: Array<{ speaker: string; text: string }> = [];
const recentErrors: DiagnosticsError[] = [];
let currentPageUrl = window.location.href;
let currentSource: DomCaptionSource | null = null;
let lastStatus: PluginStatus = "not_on_teams";
let lastEntryAt: string | null = null;
let tickHandle: ReturnType<typeof setInterval> | null = null;

function pushError(scope: DiagnosticsError["scope"], err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  recentErrors.push({ at: new Date().toISOString(), scope, message });
  if (recentErrors.length > ERROR_LIMIT) recentErrors.shift();
}

function rememberPreview(entry: { speakerOriginal?: string; text: string }): void {
  recentPreviews.push({
    speaker: entry.speakerOriginal ?? "—",
    text: entry.text.slice(0, PREVIEW_TEXT_MAX),
  });
  if (recentPreviews.length > PREVIEW_LIMIT) recentPreviews.shift();
}

function isTeamsPage(locationHref: string): boolean {
  try {
    return new URL(locationHref).hostname.toLowerCase().includes("teams");
  } catch {
    return false;
  }
}

function snapshot(): DiagnosticsSnapshot {
  const stats = currentSource?.getStats() ?? {
    rootFound: false,
    observerActive: false,
    markersCount: document.querySelectorAll('[data-tid="closed-captions-v2-items-renderer"]')
      .length,
    textNodesCount: document.querySelectorAll('[data-tid="closed-caption-text"]').length,
  };
  return {
    contentScriptLoaded: true,
    pageUrl: window.location.href,
    isTeamsPage: isTeamsPage(window.location.href),
    captionsRootFound: stats.rootFound,
    observerActive: stats.observerActive,
    markersCount: stats.markersCount,
    textNodesCount: stats.textNodesCount,
    lastEntryAt,
    lastTickAt: new Date().toISOString(),
    lastErrors: recentErrors.slice(),
    recentTexts: recentPreviews.slice(),
  };
}

async function reportDiagnostics(): Promise<void> {
  try {
    await sendRuntimeMessage({
      type: "DIAGNOSTICS_REPORT",
      payload: { snapshot: snapshot() },
    });
  } catch (err) {
    pushError("tick", err);
  }
}

async function publishStatus(status: PluginStatus): Promise<void> {
  lastStatus = status;
  try {
    await sendRuntimeMessage({
      type: "PAGE_STATUS",
      payload: { pageUrl: window.location.href, status },
    });
  } catch (err) {
    pushError("tick", err);
  }
  void reportDiagnostics();
}

async function restartCapture(): Promise<void> {
  currentSource?.stop();
  currentSource = null;
  currentPageUrl = window.location.href;

  if (!isTeamsPage(currentPageUrl)) {
    await publishStatus("not_on_teams");
    return;
  }

  await publishStatus("on_teams");

  const source = new DomCaptionSource((entry) => {
    lastEntryAt = entry.ts;
    rememberPreview(entry);
    void sendRuntimeMessage({
      type: "CAPTION_ENTRY",
      payload: { pageUrl: currentPageUrl, entry },
    }).catch((err) => pushError("parse", err));
    void reportDiagnostics();
  });

  try {
    if (!source.start()) {
      await publishStatus("captions_unknown");
      return;
    }
  } catch (err) {
    pushError("start", err);
    await publishStatus("captions_unknown");
    return;
  }

  currentSource = source;
  void reportDiagnostics();
}

function startTick(): void {
  if (tickHandle) return;
  tickHandle = setInterval(() => {
    // Captions are usually enabled after joining, and Teams can re-render the
    // captions subtree mid-call. Re-attach whenever capture isn't healthy so we
    // don't stay stuck after the one-shot init/navigation attempts.
    if (isTeamsPage(window.location.href) && !(currentSource?.isHealthy() ?? false)) {
      void restartCapture();
      return;
    }
    void reportDiagnostics();
  }, TICK_MS);
}

function init(): void {
  console.log("[teams-captions] content script loaded", window.location.href);
  try {
    if (document.body) {
      document.body.dataset.tceLoaded = new Date().toISOString();
      document.body.dataset.tceHref = window.location.href;
    } else {
      document.documentElement.dataset.tceLoaded = new Date().toISOString();
    }
  } catch {
    /* dataset write failed — ignore, diagnostic only */
  }

  const originalPushState = history.pushState.bind(history);
  const originalReplaceState = history.replaceState.bind(history);

  history.pushState = function pushState(...args) {
    originalPushState(...args);
    if (window.location.href !== currentPageUrl) {
      void restartCapture();
    }
  };

  history.replaceState = function replaceState(...args) {
    originalReplaceState(...args);
    if (window.location.href !== currentPageUrl) {
      void restartCapture();
    }
  };

  window.addEventListener("popstate", () => {
    if (window.location.href !== currentPageUrl) {
      void restartCapture();
    }
  });

  startTick();
  void restartCapture();
}

if (w[SENTINEL]) {
  console.log("[teams-captions] already loaded, skipping duplicate");
} else {
  w[SENTINEL] = true;
  init();
}

export const __testing = {
  snapshot,
  pushError,
  rememberPreview,
  lastStatus: () => lastStatus,
};

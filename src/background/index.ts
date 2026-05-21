import { countEntries } from "../shared/db/index.js";
import { analyzeSession } from "../shared/llm/orchestrator.js";
import { loadSettings } from "../shared/storage.js";
import type {
  AnalyzeSessionPayload,
  BackgroundState,
  CaptionEntryMessagePayload,
  PageStatusMessagePayload,
  PluginStatus,
  PopupState,
  RuntimeMessage,
} from "../shared/types.js";
import {
  getActiveSession,
  getActiveSessionId,
  ingestCaption,
  stopActiveSession,
} from "./session-orchestrator.js";

const state: BackgroundState = {
  status: "not_on_teams",
  session: null,
  resultText: "",
  lastError: "",
};

async function getPopupState(): Promise<PopupState> {
  const sessionId = getActiveSessionId();
  const entriesCount = sessionId ? await countEntries(sessionId) : 0;
  return {
    status: state.status,
    entriesCount,
    lastError: state.lastError || undefined,
    resultText: state.resultText || undefined,
  };
}

async function analyze(sessionId: string, prompt: string | undefined): Promise<PopupState> {
  state.status = "analyzing";
  state.lastError = "";
  try {
    const result = await analyzeSession(sessionId, { userPrompt: prompt });
    state.status = "result_ready";
    state.resultText = result.summary.content;
    return getPopupState();
  } catch (error) {
    state.status = "error";
    state.lastError = error instanceof Error ? error.message : "Unexpected error";
    return getPopupState();
  }
}

async function analyzeCurrentSession(prompt: string | undefined): Promise<PopupState> {
  const sessionId = getActiveSessionId();
  if (!sessionId) {
    state.status = "error";
    state.lastError = "No active session";
    return getPopupState();
  }
  return analyze(sessionId, prompt);
}

async function analyzeArbitrarySession(payload: AnalyzeSessionPayload): Promise<PopupState> {
  return analyze(payload.sessionId, payload.prompt);
}

async function handlePageStatus(payload: PageStatusMessagePayload): Promise<PopupState> {
  const active = await getActiveSession();
  if (active && active.pageUrl !== payload.pageUrl) {
    await stopActiveSession();
    state.resultText = "";
  }
  state.status = payload.status;
  state.lastError = "";
  return getPopupState();
}

async function handleCaptionEntry(payload: CaptionEntryMessagePayload): Promise<void> {
  state.session = await ingestCaption(payload.pageUrl, payload.entry);
  state.status = "capturing";
}

async function handleClearResult(): Promise<PopupState> {
  state.resultText = "";
  state.lastError = "";
  const fallback: PluginStatus = getActiveSessionId() ? "capturing" : "on_teams";
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

browser.runtime.onMessage.addListener((message: RuntimeMessage) => {
  switch (message.type) {
    case "GET_POPUP_STATE":
      return getPopupState();

    case "GET_SETTINGS":
      return loadSettings();

    case "PAGE_STATUS":
      return handlePageStatus(message.payload);

    case "CAPTION_ENTRY":
      return handleCaptionEntry(message.payload);

    case "ANALYZE_CURRENT_SESSION":
      return analyzeCurrentSession(message.payload?.prompt);

    case "ANALYZE_SESSION":
      return analyzeArbitrarySession(message.payload);

    case "CLEAR_RESULT":
      return handleClearResult();

    case "STOP_CAPTURE":
      return handleStopCapture();

    default:
      return Promise.resolve();
  }
});

import { buildAnalysisPayload } from "../analysis/payload-builder.js";
import { generateAnalysis } from "../api/client.js";
import { loadSettings } from "../shared/storage.js";
import type {
  BackgroundState,
  CaptionEntryMessagePayload,
  PageStatusMessagePayload,
  PopupState,
  RuntimeMessage,
} from "../shared/types.js";
import { appendCaption, clearSession, getSession } from "../session/buffer.js";

const state: BackgroundState = {
  status: "not_on_teams",
  session: null,
  resultText: "",
  lastError: "",
};

function getPopupState(): PopupState {
  return {
    status: state.status,
    entriesCount: getSession()?.entries.length ?? 0,
    lastError: state.lastError || undefined,
    resultText: state.resultText || undefined,
  };
}

async function analyzeCurrentSession(): Promise<PopupState> {
  const session = getSession();

  if (!session || session.entries.length === 0) {
    state.status = "error";
    state.lastError = "No captions collected";
    return getPopupState();
  }

  state.status = "analyzing";
  state.lastError = "";

  try {
    const settings = await loadSettings();
    const payload = buildAnalysisPayload(session, settings);
    const resultText = await generateAnalysis(settings, payload);

    state.status = "result_ready";
    state.resultText = resultText;
    return getPopupState();
  } catch (error) {
    state.status = "error";
    state.lastError = error instanceof Error ? error.message : "Unexpected error";
    return getPopupState();
  }
}

browser.runtime.onMessage.addListener((message: RuntimeMessage) => {
  switch (message.type) {
    case "GET_POPUP_STATE":
      return Promise.resolve(getPopupState());

    case "GET_SETTINGS":
      return loadSettings();

    case "PAGE_STATUS": {
      const payload = message.payload as PageStatusMessagePayload;
      const session = getSession();

      if (session && session.pageUrl !== payload.pageUrl) {
        clearSession();
        state.session = null;
        state.resultText = "";
      }

      state.status = payload.status;
      state.lastError = "";
      return Promise.resolve(getPopupState());
    }

    case "CAPTION_ENTRY": {
      const payload = message.payload as CaptionEntryMessagePayload;
      state.session = appendCaption(payload.pageUrl, payload.entry);
      state.status = "capturing";
      return Promise.resolve();
    }

    case "ANALYZE_CURRENT_SESSION":
      return analyzeCurrentSession();

    case "CLEAR_RESULT":
      state.resultText = "";
      state.lastError = "";
      state.status = getSession() ? "capturing" : "on_teams";
      return Promise.resolve(getPopupState());

    case "STOP_CAPTURE":
      clearSession();
      state.session = null;
      state.resultText = "";
      state.lastError = "";
      state.status = "on_teams";
      return Promise.resolve(getPopupState());

    default:
      return Promise.resolve();
  }
});

export type ProviderId = "copilot" | "claude" | "gemini";

export type PluginSettings = {
  apiBaseUrl: string;
  bearerToken: string;
  provider: ProviderId;
  customTitleDefault: string;
  extendedPromptDefault: string;
  participantAliases: Record<string, string>;
};

export type PluginStatus =
  | "not_on_teams"
  | "on_teams"
  | "captions_unknown"
  | "capturing"
  | "analyzing"
  | "result_ready"
  | "error";

export type CaptionEntry = {
  id: string;
  ts: string;
  speakerOriginal?: string;
  speakerResolved?: string;
  text: string;
  source: "direct" | "dom";
};

export type CaptionSession = {
  sessionId: string;
  pageUrl: string;
  startedAt: string;
  updatedAt: string;
  entries: CaptionEntry[];
};

export type PopupState = {
  status: PluginStatus;
  entriesCount: number;
  lastError?: string;
  resultText?: string;
};

export type BackgroundState = {
  status: PluginStatus;
  session: CaptionSession | null;
  resultText: string;
  lastError: string;
};

export type CaptionEntryMessagePayload = {
  pageUrl: string;
  entry: CaptionEntry;
};

export type PageStatusMessagePayload = {
  pageUrl: string;
  status: PluginStatus;
};

export type RuntimeMessage =
  | { type: "GET_POPUP_STATE" }
  | { type: "GET_SETTINGS" }
  | { type: "CAPTION_ENTRY"; payload: CaptionEntryMessagePayload }
  | { type: "PAGE_STATUS"; payload: PageStatusMessagePayload }
  | { type: "ANALYZE_CURRENT_SESSION" }
  | { type: "CLEAR_RESULT" }
  | { type: "STOP_CAPTURE" };

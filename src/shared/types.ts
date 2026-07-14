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

export type DiagnosticsError = {
  at: string;
  scope: "start" | "parse" | "tick";
  message: string;
};

export type DiagnosticsCaptionPreview = {
  speaker: string;
  text: string;
};

export type DiagnosticsSessionInfo = {
  id: string;
  pageUrl: string;
  startedAt: string;
  updatedAt: string;
  entriesCount: number;
};

export type DiagnosticsSnapshot = {
  contentScriptLoaded: boolean;
  pageUrl: string;
  isTeamsPage: boolean;
  captionsRootFound: boolean;
  observerActive: boolean;
  markersCount: number;
  textNodesCount: number;
  lastEntryAt: string | null;
  lastTickAt: string;
  lastErrors: DiagnosticsError[];
  recentTexts: DiagnosticsCaptionPreview[];
};

export type DiagnosticsView = DiagnosticsSnapshot & {
  receivedAt: string | null;
  session: DiagnosticsSessionInfo | null;
  extensionVersion: string;
  hasPreviousSummary: boolean;
};

export type PopupState = {
  status: PluginStatus;
  entriesCount: number;
  lastError?: string;
  resultText?: string;
  hasPreviousSummary?: boolean;
  activeSessionId?: string;
  defaults?: { title: string; prompt: string };
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

export type DiagnosticsReportPayload = {
  snapshot: DiagnosticsSnapshot;
};

export type AnalyzeOptionsPayload = {
  prompt?: string;
  title?: string;
  includePrevious?: boolean;
};

export type AnalyzeSessionPayload = AnalyzeOptionsPayload & {
  sessionId: string;
};

// Rejected background handlers respond with this instead of leaving the
// sender's promise resolved to undefined.
export type ErrorResponse = { __error: string };

export type RuntimeMessage =
  | { type: "GET_POPUP_STATE" }
  | { type: "GET_SETTINGS" }
  | { type: "GET_DIAGNOSTICS" }
  | { type: "CAPTION_ENTRY"; payload: CaptionEntryMessagePayload }
  | { type: "PAGE_STATUS"; payload: PageStatusMessagePayload }
  | { type: "DIAGNOSTICS_REPORT"; payload: DiagnosticsReportPayload }
  | { type: "ANALYZE_CURRENT_SESSION"; payload?: AnalyzeOptionsPayload }
  | { type: "ANALYZE_SESSION"; payload: AnalyzeSessionPayload }
  | { type: "CREATE_SESSION"; payload?: { pageUrl?: string } }
  | { type: "SET_ACTIVE_SESSION"; payload: { sessionId: string } }
  | { type: "CLEAR_RESULT" }
  | { type: "STOP_CAPTURE" }
  | { type: "FORCE_INJECT" };

export type ForceInjectProbe = {
  sentinelSet: boolean;
  bodyDatasetLoaded: string | null;
  bodyDatasetHref: string | null;
  htmlDatasetLoaded: string | null;
  documentReadyState: string;
  hasBody: boolean;
  markersInDom: number;
  textNodesInDom: number;
  ts: number;
  error?: string;
};

export type ForceInjectResult = {
  ok: boolean;
  message: string;
  tabId?: number;
  tabUrl?: string;
  probe?: ForceInjectProbe;
};

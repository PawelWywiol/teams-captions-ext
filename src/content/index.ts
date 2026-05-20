import { sendRuntimeMessage } from "../shared/messages.js";
import { DomCaptionSource } from "./dom-source.js";

let currentPageUrl = window.location.href;
let currentSource: DomCaptionSource | null = null;

async function publishStatus(status: "not_on_teams" | "on_teams" | "captions_unknown" | "capturing"): Promise<void> {
  await sendRuntimeMessage({
    type: "PAGE_STATUS",
    payload: {
      pageUrl: window.location.href,
      status,
    },
  });
}

function isTeamsPage(locationHref: string): boolean {
  try {
    return new URL(locationHref).hostname.toLowerCase().includes("teams");
  } catch {
    return false;
  }
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
    void sendRuntimeMessage({
      type: "CAPTION_ENTRY",
      payload: {
        pageUrl: currentPageUrl,
        entry,
      },
    });
  });

  if (!source.start()) {
    await publishStatus("captions_unknown");
    return;
  }

  currentSource = source;
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

void restartCapture();

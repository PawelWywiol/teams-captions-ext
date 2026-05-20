import { sendRuntimeMessage } from "../shared/messages.js";
import type { PopupState } from "../shared/types.js";

function ensureElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing element: ${id}`);
  return element as T;
}

function renderState(state: PopupState): void {
  ensureElement<HTMLDivElement>("status").textContent = `Status: ${state.status}`;
  ensureElement<HTMLDivElement>("entries-count").textContent = `Captions: ${state.entriesCount}`;
  ensureElement<HTMLDivElement>("error").textContent = state.lastError ?? "";
  ensureElement<HTMLPreElement>("result").textContent = state.resultText ?? "";
}

async function refresh(): Promise<void> {
  const state = await sendRuntimeMessage<PopupState>({ type: "GET_POPUP_STATE" });
  renderState(state);
}

document.addEventListener("DOMContentLoaded", () => {
  ensureElement<HTMLButtonElement>("analyze").addEventListener("click", async () => {
    const state = await sendRuntimeMessage<PopupState>({
      type: "ANALYZE_CURRENT_SESSION",
    });
    renderState(state);
  });

  ensureElement<HTMLButtonElement>("clear-result").addEventListener("click", async () => {
    const state = await sendRuntimeMessage<PopupState>({
      type: "CLEAR_RESULT",
    });
    renderState(state);
  });

  ensureElement<HTMLButtonElement>("open-settings").addEventListener("click", () => {
    void browser.runtime.openOptionsPage();
  });

  void refresh();
});

# Installing the Chrome / Chromium build

Works in Chrome, Edge, Brave, Arc and other Chromium browsers. The extension is not published in the Chrome Web Store — you load it unpacked in developer mode.

## 1. Get the build

Either download `teams-captions-ext-chromium-<TAG>.zip` from the latest [GitHub Release](https://github.com/PawelWywiol/teams-captions-ext/releases) and unzip it, or build it yourself:

```bash
pnpm install
pnpm build:extension   # outputs dist/extension/
```

## 2. Load unpacked

1. Open `chrome://extensions` (Edge: `edge://extensions`).
2. Enable **Developer mode** (toggle in the top-right corner).
3. Click **Load unpacked** and select the unzipped folder (or `dist/extension/` for a local build).
4. Pin the **Teams Captions Extension** icon via the puzzle-piece menu for quick access.

After pulling a new release or rebuilding, click the ↻ **reload** button on the extension card.

## 3. Configure the proxy

Open the extension's **Settings** (toolbar icon → ⚙) and fill in:

- **API Base URL** — your local [`cli-llm-proxy`](https://github.com/PawelWywiol/cli-llm-proxy) instance (e.g. `http://127.0.0.1:11434`)
- **Bearer Token** — only if the proxy requires it
- **Provider** — copilot / claude / gemini, as configured in the proxy
- Aliases / extended prompt — optional

Chrome will ask once to grant access to the proxy origin; accept it.

## 4. Capture and analyse

1. Open a Teams meeting (`teams.microsoft.com` or `teams.cloud.microsoft`) and turn on live captions.
2. The toolbar icon shows **Capturing** when the DOM observer is active.
3. Open the popup — **Analyze** tab has a Title, Prompt and "Include previous summary" toggle. The payload sent to the LLM combines all of them plus the transcript.
4. Click **Sessions** to browse the full transcript history; **Settings** opens the options page.
5. The **Debug** tab in the popup is the source of truth when something is off — it shows whether the content script loaded, whether the captions root was found, marker/text-node counts, the last 3 captions seen, the last 5 errors, plus active session info.

## Troubleshooting

| Symptom                                | Fix                                                                                                |
| -------------------------------------- | -------------------------------------------------------------------------------------------------- |
| "Manifest file is missing" on load     | You selected the zip or a wrapper folder — pick the folder that contains `manifest.json` directly. |
| Popup says "Open a Teams meeting to start" while on a meeting | Reload the Teams tab (content scripts inject on load), then check the popup's **Debug** tab; **Force inject content script** re-injects it manually. |
| Analyze fails with "Permission denied" | The proxy origin prompt was dismissed. Re-open Settings, re-enter the URL, save, retry.            |
| Debug shows `Captions root: missing` while captions ARE visible | Teams may have rolled a new DOM. Open the page DevTools and verify the data-tids `closed-captions-v2-items-renderer`, `closed-caption-text`, `author` still exist; if not, file an issue with the updated DOM snapshot. |
| Extension disabled after browser restart | Chrome can disable unpacked extensions on managed profiles — re-enable it on `chrome://extensions`. |
| Captions counted but Sessions list stays empty | The extension's IndexedDB got into a broken state. Reset it: open the popup → right-click → Inspect → Console → run `indexedDB.deleteDatabase("teams-captions-ext")`, then reload the extension. If that hangs, quit Chrome fully and delete the folder `IndexedDB/chrome-extension_<extension-id>_0.indexeddb.leveldb` inside your Chrome profile directory. |

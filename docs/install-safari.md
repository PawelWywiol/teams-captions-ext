# Installing the Safari build (unsigned developer artifact)

The Safari artifact published on each [GitHub Release](https://github.com/PawelWywiol/teams-captions-ext/releases) is an **unsigned** `.app` produced by `safari-web-extension-converter`. Safari refuses to load unsigned web extensions by default; the steps below enable them for the current session.

> **This is a developer-distribution build, not an App Store release.** Inspect the code (or build it yourself with `pnpm package:safari`) before trusting it.

## 1. Download

From the latest release, download `teams-captions-ext-safari-unsigned-<TAG>.zip`. Unzip it; you'll get `Teams Captions.app`.

## 2. Allow unsigned extensions in Safari

1. Open Safari → **Settings** → **Advanced** → check **Show features for web developers** (older macOS: **Show Develop menu in menu bar**).
2. In the menu bar choose **Develop** → **Allow Unsigned Extensions**. macOS will prompt for your password.
3. This setting resets every time you quit Safari — repeat steps 1–2 after each restart.

## 3. Run the host app once

Move `Teams Captions.app` into `/Applications/` and double-click it. The first launch registers the bundled extension with Safari. macOS will warn about an unidentified developer — Right-click → **Open** to confirm.

You can quit the app immediately after the warning is dismissed. The extension stays registered.

## 4. Enable the extension

1. Safari → **Settings** → **Extensions**.
2. Tick **Teams Captions Extension**.
3. Click **Edit Websites…** to confirm permissions for `teams.microsoft.com`.

## 5. Configure the proxy

Open the extension's **Settings** (toolbar icon → ⚙) and fill in:

- **API Base URL** — your local [`cli-llm-proxy`](https://github.com/PawelWywiol/cli-llm-proxy) instance (e.g. `http://127.0.0.1:11434`)
- **Bearer Token** — only if the proxy requires it
- **Provider** — copilot / claude / gemini, as configured in the proxy
- Aliases / extended prompt — optional

Safari will ask once to grant access to the proxy origin; accept it.

## 6. Capture and analyse

1. Open a Teams meeting in Safari and turn on live captions.
2. The toolbar icon shows **Capturing** when the DOM observer is active.
3. Click **Sessions** to browse captured transcripts, then switch to the **Summary** tab and press **Analyze**.
4. Use **Copy** to put the raw markdown summary on the clipboard.

## Troubleshooting

| Symptom                                | Fix                                                                                                |
| -------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Extension not visible in Settings      | Run the host `.app` once; "Allow Unsigned Extensions" must still be ticked.                        |
| Toggle is greyed out                   | macOS reset the unsigned-extensions flag — re-enable it from **Develop**.                          |
| Analyze fails with "Permission denied" | The proxy origin prompt was dismissed. Re-open Settings, re-enter the URL, save, retry.            |
| Permission denied for `teams.microsoft.com` | In **Extensions → Teams Captions Extension → Edit Websites…**, set the Teams host to **Allow**. |

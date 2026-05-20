# teams-captions-ext

Privacy-first browser extension starter for capturing Microsoft Teams captions and sending them on demand to a compatible LLM proxy.

## Scope

- Safari-first Teams extension
- Manual analysis first
- Configurable proxy base URL
- Configurable bearer token
- Participant aliases
- Custom conversation title
- Extended prompt
- No telemetry
- No default persistent transcript storage beyond what the user explicitly enables later

## Current status

This repository currently contains a secure TypeScript scaffold with:

- background script starter
- content script starter
- popup starter
- options starter
- shared types and storage helpers
- payload builder and proxy client
- Unit tests for the core pure logic
- Lefthook gates: pre-commit runs typecheck/lint/format check, pre-push runs tests
- CI runs typecheck, lint, format check, test, and dependency audit
- local mock proxy for manual extension testing

The repo is now in a **manual-testable** state for Chromium-family browsers using the packaged extension bundle and the local mock proxy. Safari conversion/packaging is still a follow-up step.

## Quick start

```bash
pnpm install
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm build
pnpm build:extension
pnpm audit:deps
```

## Packaging

`pnpm build:extension` produces a clean browser-extension bundle in `dist/extension/`:

- `manifest.json`
- `background/index.js`
- `content/index.js`
- `options/index.html` + `options/index.js`
- `popup/index.html` + `popup/index.js`

The packaging output intentionally excludes test files and the raw `src/` tree.

## Manual test

### 1. Build the extension bundle

```bash
pnpm build:extension
```

### 2. Start the local mock proxy

```bash
pnpm dev:mock-proxy
```

Optional bearer-token mode:

```bash
MOCK_BEARER_TOKEN=secret-demo-token pnpm dev:mock-proxy
```

The proxy listens on:

- `http://127.0.0.1:8787`
- `GET /health`
- `POST /v1/generate`

### 3. Verify the mock proxy quickly

```bash
curl http://127.0.0.1:8787/health
```

Expected: JSON with `ok: true`.

### 4. Load `dist/extension/`

Use a Chromium browser for now:

- open extensions page
- enable developer mode
- choose **Load unpacked**
- Load `dist/extension/`

### 4. Configure the extension

Open extension settings and set:

- `API Base URL`: `http://127.0.0.1:8787`
- `Bearer Token`: empty by default, or `secret-demo-token` if you started the mock proxy with `MOCK_BEARER_TOKEN`
- provider: any value is fine for mock testing
- optional custom title / prompt / aliases as desired

Save settings.

### 5. Manual smoke test

- open Microsoft Teams in browser
- open a meeting page where captions can appear
- trigger or simulate captions
- open the extension popup
- verify status changes from Teams page detection / capture
- click **Analyze**
- expect a mock response containing `Mock summary`

### 6. What this proves

This manual test proves:

- packaged extension loads correctly
- settings page saves and reloads
- runtime host-permission request path works for configured proxy origin
- popup can trigger analysis
- background can call the configured API endpoint
- token flow works in both no-token and bearer-token-required mode

## Structure

```text
src/
  aliases/
  analysis/
  api/
  background/
  content/
  options/
  popup/
  session/
  shared/
  manifest.json
  globals.d.ts
tests/
docs/architecture/
scripts/
```

## Security notes

- analysis requests go only to the configured endpoint
- transcript data is treated as untrusted input
- no transcript is sent unless analysis is triggered
- extension logic is split so pure logic stays testable
- proxy/API host access is narrowed to optional runtime-granted origins instead of broad static permissions
- bearer token is kept out of persistent local storage

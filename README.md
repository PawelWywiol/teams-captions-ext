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

It is intentionally light on build tooling for browser packaging. The next step is to add the real extension packaging path and Teams-specific DOM selectors.

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
```

## Security notes

- analysis requests go only to the configured endpoint
- transcript data is treated as untrusted input
- no transcript is sent unless analysis is triggered
- extension logic is split so pure logic stays testable

# Threat model

## Main risks

1. Transcript leakage to unintended endpoints
2. Over-broad page access
3. Unsafe rendering of model output
4. Storing sensitive meeting data longer than needed
5. Teams DOM changes breaking extraction silently

## Current mitigations

- no telemetry
- no automatic transcript upload
- explicit configured endpoint only
- transcript treated as untrusted input
- pure logic separated for testing
- transcripts persisted only in local IndexedDB (origin-scoped to the extension); deletable per-session from the UI

## Next mitigations

- add explicit export flow
- add debug redaction
- sanitize markdown rendering
- offer a one-click "wipe all transcripts" action

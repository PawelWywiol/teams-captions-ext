# LLM flow

1. Content script observes Teams captions.
2. Caption entry is sent to the background service worker.
3. Background orchestrator resolves the active session (creating one if needed) and persists the entry through Dexie.
4. User triggers analysis from the popup.
5. Background loads settings and the full session (entries projected via `loadSession`).
6. Payload builder creates a structured transcript block.
7. Proxy client sends `POST /v1/chat/completions`.
8. Background stores the returned text in popup state.

Planned (PR #3): split step 6–7 into chunked map + reduce with cache, persisting chunk summaries and final summaries alongside the session.

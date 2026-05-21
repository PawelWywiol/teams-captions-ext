# Architecture overview

```
┌──────────────────────┐    runtime.sendMessage    ┌──────────────────────────┐
│ content/             │ ────────────────────────▶ │ background/ (service     │
│  - DomCaptionSource  │                           │   worker)                │
│  - dedup, selectors  │ ◀──── (no direct reply)   │  - session-orchestrator  │
│  - detector          │                           │  - message router        │
└──────────────────────┘                           └─────────────┬────────────┘
                                                                 │
                                              ┌──────────────────┴──────────────────┐
                                              ▼                                     ▼
                                  ┌────────────────────┐                 ┌──────────────────────┐
                                  │ shared/db/         │                 │ api/ + analysis/     │
                                  │  Dexie (IndexedDB) │                 │  - permissions guard │
                                  │  sessions, entries │                 │  - payload builder   │
                                  └─────────┬──────────┘                 │  - LLM proxy client  │
                                            │ liveQuery                  └──────────────────────┘
                                            ▼
                                  ┌────────────────────┐
                                  │ popup/, options/   │
                                  │ (and future ui/    │
                                  │  sessions view)    │
                                  └────────────────────┘
```

## Layers

- **content/** — observes Teams DOM, emits `CAPTION_ENTRY` / `PAGE_STATUS` messages. Never writes to storage.
- **background/** — single writer to the database. Owns `session-orchestrator` (active-session resolution, dedup, persistence) and the message router that handles popup/options requests.
- **shared/db/** — Dexie over IndexedDB. Single source of truth for transcripts. Survives tab close, service-worker restart, and browser restart.
- **shared/storage.ts** — `chrome.storage.local`/`session` for settings + secrets (separate concern from transcripts).
- **api/ + analysis/** — on-demand LLM call path: permission check → payload build → POST to local proxy.
- **popup/, options/** — UI surfaces. Read-only on the database (PR #1 still reads via background-state messages; later PRs switch to direct `liveQuery`).

## Invariants

- Only the background service worker writes to `sessions` / `entries`.
- One active session per `pageUrl` at a time. Switching URL ends the previous session.
- Dedup is local-window only (recent N entries from DB) — not a global uniqueness constraint.
- Caption rows are append-only; titles and end-times are mutable, raw text is not.

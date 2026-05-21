# Data model

Transcripts are persisted in IndexedDB via Dexie (`teams-captions-ext` database). Settings stay in `chrome.storage.local`/`session` (separate concern). Schema is versioned (`db.version(N).stores(...)`); PR #1 introduces version 1.

## Tables

### `sessions`

| field       | type                | notes                                                       |
| ----------- | ------------------- | ----------------------------------------------------------- |
| `id`        | `string` (uuid, PK) | `crypto.randomUUID()`                                       |
| `pageUrl`   | `string` (indexed)  | full Teams URL captured at creation                         |
| `title`     | `string`            | derived from host + start time; editable in UI              |
| `startedAt` | ISO 8601 (indexed)  | session creation                                            |
| `updatedAt` | ISO 8601 (indexed)  | bumped on every entry append                                |
| `endedAt?`  | ISO 8601            | set when session is stopped or replaced by a new active one |

### `entries`

| field             | type                       | notes                       |
| ----------------- | -------------------------- | --------------------------- |
| `id`              | `string` (uuid, PK)        | minted by the content script |
| `sessionId`       | `string` (indexed, FK)     | references `sessions.id`    |
| `ts`              | ISO 8601                   | speaker utterance time      |
| `speakerOriginal` | `string?`                  | raw Teams display name      |
| `speakerResolved` | `string?`                  | optional alias mapping      |
| `text`            | `string`                   | normalised caption line     |
| `source`          | `"direct" \| "dom"`        | capture path                |

Compound index `[sessionId+ts]` powers ordered reads (`getSessionEntries`, `getRecentEntries`).

## Settings (unchanged)

`chrome.storage.local` (sanitized `PluginSettings`) + `chrome.storage.session` for bearer token. See `src/shared/storage.ts`.

## Lifecycle

1. Content script detects Teams page → posts `PAGE_STATUS`.
2. First `CAPTION_ENTRY` for a `pageUrl` creates a session row (or reuses any existing active one).
3. Each entry is dedup-checked against the last 5 entries for the session, then persisted.
4. `STOP_CAPTURE` or a `pageUrl` change ends the active session (`endedAt = now`).

Future versions: `chunks` (cached LLM map results) and `summaries` (per-prompt outputs) land as version 2 — version 1 is never rewritten.

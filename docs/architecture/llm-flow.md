# LLM flow

1. Content script observes Teams captions
2. Caption entry is sent to the background script
3. Background aggregates the in-memory session
4. User triggers analysis from popup
5. Background loads settings
6. Payload builder creates a structured transcript block
7. Proxy client sends `POST /v1/generate`
8. Background stores the returned text in popup state

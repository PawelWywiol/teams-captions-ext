# Data model

## Core entities

### Caption entry

- generated locally
- includes speaker, text, source, timestamp
- stays in memory in the current scaffold

### Caption session

- groups caption entries by page URL
- tracks start and last update time
- can later evolve into durable storage

### Settings

- proxy URL
- bearer token
- default provider
- participant aliases
- default title
- default extended prompt

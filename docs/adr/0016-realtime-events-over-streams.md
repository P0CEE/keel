# Realtime is a typed event log per household, replayed over SSE

ramnn relayed Redis pub/sub messages to hand-rolled server-sent events, with topics added ad hoc and invalidation handlers spread across the app; an event emitted while a tab was disconnected was lost, and nothing guaranteed an event followed a committed write. We decided that realtime events are declared in one registry (name and Zod schema), emitted by application modules inside their scoped transaction and published only after commit, appended to one Redis Stream per household, and delivered through a tRPC subscription over SSE that yields each entry with `tracked(id, data)`. A reconnecting client sends its last event id and the server replays what it missed; if the stream was trimmed past that id, the server tells the client to resynchronize.

## Considered Options

- **Redis pub/sub.** Rejected: no replay, so every reconnection risks a stale screen.
- **WebSockets.** Rejected: the traffic is server-to-client only, SSE already works through keel's tRPC link and proxies, and reconnection with a last event id is built in.
- **Pushing data in events.** Rejected: events carry ids, months and counts only, and the app refetches through tRPC under row-level security, so realtime cannot leak what a member may not read and read logic is never duplicated.

## Consequences

- One `RealtimeProvider` maps each event to precise query invalidations, relying on deterministic query keys.
- Each API instance holds one blocking stream reader for all its connected households, not one Redis connection per tab.
- Events tied to a private account carry `privateTo` and are delivered only to that member.

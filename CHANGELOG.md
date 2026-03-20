# Changelog — Snake × 4

## v1.1.0 — 2026-03-20

### Fix: Players not appearing as "Joined" in waiting room

Joining players were never showing up as "Joined" on the host's screen. Root cause: `joinChannel` was calling `.subscribe()` internally, and then `handleJoin` called `.subscribe()` again on the same channel object. Supabase Realtime does not support double-subscribing — the second callback (which triggers `request_slot`) never fired, so the host never assigned a slot to joining players.

Fix: removed the premature `.subscribe()` from inside `joinChannel`. The function now just registers event handlers and returns the channel unsubscribed. `handleHost` and `handleJoin` each subscribe with their own callbacks.

---

## v1.0.0 — 2026-03-19

Initial release. 4-player competitive Snake using Supabase Realtime broadcast channels. Room codes, waiting room, color-coded snake tracks, collision detection, game-over screen, and restart flow.

# Changelog — Snake × 4

## v1.2.0 — 2026-03-20

### Wall collision
Removed wrapping — hitting any edge of the grid is now instant game over. The border glows cyan to make the walls visually clear.

### Progressive speed
Game starts at 150ms/tick and speeds up by 6ms per food eaten, capping at 75ms (roughly 2x base speed). Uses recursive setTimeout instead of setInterval for accurate per-tick speed control.

### Scroll lock
All touch-scroll and overscroll disabled globally via CSS (`overflow: hidden`, `position: fixed` on body) and a `touchmove` preventDefault handler — prevents iOS rubber-band scrolling from interfering mid-game.

### Lo-fi techno background music
Procedural Web Audio API engine (no CDN/external assets). Kick drum on every beat (130 BPM four-on-the-floor), filtered sawtooth bassline, hi-hats, and a quiet A-minor chord pad for atmosphere. Mute/unmute button added to the game header. Audio initializes on first user gesture (Join/Create Room) to comply with browser autoplay policy.

---

## v1.1.0 — 2026-03-20

### Fix: Players not appearing as "Joined" in waiting room

Joining players were never showing up as "Joined" on the host's screen. Root cause: `joinChannel` was calling `.subscribe()` internally, and then `handleJoin` called `.subscribe()` again on the same channel object. Supabase Realtime does not support double-subscribing — the second callback (which triggers `request_slot`) never fired, so the host never assigned a slot to joining players.

Fix: removed the premature `.subscribe()` from inside `joinChannel`. The function now just registers event handlers and returns the channel unsubscribed. `handleHost` and `handleJoin` each subscribe with their own callbacks.

---

## v1.0.0 — 2026-03-19

Initial release. 4-player competitive Snake using Supabase Realtime broadcast channels. Room codes, waiting room, color-coded snake tracks, collision detection, game-over screen, and restart flow.

# Changelog — Snake × 4

## v1.5.0 — 2026-03-20

### Single-player: D-pad controls
Fixed single-player mode so the player can move in all four directions. Previously, the player was locked to one direction (slot 0 = UP only). The single button is now replaced with a D-pad (4 directional buttons in a cross layout) when in single-player mode. Arrow keys on keyboard also now support all four directions in single-player.

### Performance: canvas rendering overhaul
- **Offscreen grid cache**: the 20×20 grid is pre-rendered once and composited each frame with a single `drawImage` blit, eliminating 42 redundant stroke calls per frame.
- **Canvas resize fix**: `canvas.width`/`canvas.height` were being reset inside the draw loop every frame (clearing the canvas and triggering browser layout recalculation). Now set once on mount and on window resize only.
- **Continuous RAF loop**: animation loop now runs continuously and reads game state via refs, instead of restarting every 250ms on React state updates. Eliminates animation jank at tick boundaries.
- **Device pixel ratio**: canvas now scales to `devicePixelRatio` (2× or 3× on mobile), rendering crisp graphics on retina/OLED screens instead of blurry upscaled pixels.

---

## v1.4.0 — 2026-03-20

### Game mode: Single Player
New single player mode on the lobby screen — skips the waiting room and jumps straight into the game. No Supabase channel, no room code, instant play.

### Game mode: Multiplayer (existing, now labeled)
Existing multiplayer flow unchanged — create room, share code, wait for players, start.

### Wall config: Finite vs Infinite
Host/solo player selects wall mode on the lobby screen before starting:
- **Finite** — hitting any wall is game over (previous behavior). Wall border glows red-cyan.
- **Infinite** — snake wraps to the opposite side (classic snake behavior). Wall border shows as a dim dashed line.

In multiplayer, the wall mode is broadcast to all players in `game_start` and `game_restart` payloads, so all clients play the same mode. The waiting room shows a Finite/Infinite badge. Joining players always use the host's config.

---

## v1.3.0 — 2026-03-20

### Larger play field
Increased the canvas size budget from 45% → 55% of screen height, and widened the horizontal max. The snake has significantly more room now.

### Rebalanced difficulty curve
Base speed slowed from 150ms → 250ms per tick. First 2 foods eaten have no speed change (easy warmup). From food 3 onward, speed increases by 10ms per food, bottoming out at 80ms — roughly 3x the starting speed. Players get a gentle on-ramp before the pace picks up.

### Persistent high score
High score saved to `localStorage` and displayed in the game header below the live score. Persists across sessions on each device.

---

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

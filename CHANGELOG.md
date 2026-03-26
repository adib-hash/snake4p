# Changelog — Snake × 4

## v2.2.0 — 2026-03-25

### Redesigned single-player D-pad layout

Replaced the 3-column cross layout (which wasted two corner cells and kept buttons small) with a full-width controller layout:

```
[           ↑           ]
[     ←     ] [     →     ]
[           ↓           ]
```

- UP and DOWN are now full-width bars spanning the entire game board width — huge tap targets
- LEFT and RIGHT fill the middle row side-by-side, each taking half the width
- Button height: 100px (UP/DOWN) and 110px (LEFT/RIGHT)
- Arrow icons: 40×40
- The D-pad now fills the full available width rather than being capped at 280px
- Overall tap area is roughly 3× larger than before

---

## v2.1.0 — 2026-03-25

### Larger single-player D-pad controls

The four directional buttons in single-player mode were too small and awkward to tap accurately on mobile.

- Button height increased from 64px → 88px
- Arrow icons enlarged from 22×22 → 32×32
- Button corners more rounded (12px → 16px radius) for a more tactile feel
- D-pad grid capped at 280px wide and centered — prevents buttons from stretching absurdly wide on large phones
- Grid gap increased from 6px → 8px for cleaner separation
- Added `touchAction: none` on each button — prevents the browser from intercepting touch events as scroll gestures mid-press

---

## v2.0.0 — 2026-03-20

### Multiplayer Input Lag Reduction (three compounding optimizations)

Non-host players previously experienced 200–350ms of perceived lag between pressing their button and seeing the snake move. This release eliminates most of that through three layered fixes:

**1. Client-side prediction (biggest win)**
When a non-host player presses their button, the predicted next game state is computed and displayed immediately — eliminating the full round-trip wait. The host's authoritative `game_state` broadcast arrives ~150ms later and silently overwrites the prediction. Food position and score are intentionally held at their current values in the prediction (host and client use different random seeds, so food would diverge by one frame — suppressed to prevent a visible flicker on reconcile). Game-over is never predicted; host confirmation is always required.

**2. Tick rate: 200ms → 150ms with adjusted speed curve**
Reduces worst-case tick-wait latency by 25%. The speed formula is adjusted (`×5` per point vs `×8`) so the game reaches its 80ms difficulty cap at roughly the same score as before. Mid-game pace is marginally faster — an intentional feel improvement.

**3. Removed `self: true` from Supabase channel config**
With `self: true`, the host was receiving its own `game_start` and `game_restart` broadcasts and running duplicate state initialization (no host guard on those handlers). Removing `self: true` eliminates the double-fire. The `direction` and `game_state` handlers already had host guards and are unaffected.

---

## v1.9.1 — 2026-03-20

### Fix: joiner stuck as spectator with "?" button

A joining player could reach the game screen with `mySlot === -1` (no direction assigned), rendering a non-functional `?` button instead of their directional control. This was distinct from the v1.9.0 fix (which addressed Unicode arrow rendering) — it was a slot assignment failure.

Three gaps fixed:

1. **Channel reconnect leaks retry interval** — when the Supabase channel dropped and resubscribed, the subscribe callback created a new `setInterval` without clearing the old one. Fixed: old interval is now cleared before creating a new one. Also, the slot request is now skipped entirely if the slot is already confirmed, preventing redundant re-requests on reconnect.

2. **`game_start` fires with no slot** — if a player joined but hadn't yet received `slot_assigned` when the host started the game, they would transition to the game screen with `mySlot === -1` and never recover. Fixed: `game_start` handler now immediately sends `request_slot` if `mySlot` is still `-1`.

3. **Tab-return handler doesn't re-request slot** — the non-host visibility handler already resubscribed the channel and requested fresh game state on tab return, but did not re-request the slot if it was missing. Fixed: `request_slot` is now also sent on tab return if `mySlotRef.current === -1`.

---

## v1.9.0 — 2026-03-20

### Fix: false game-over from rapid direction inputs

The opposite-direction guard (which prevents the snake from reversing onto itself) was checking against the *currently executing* direction, not the *last queued* direction. If two players pressed their buttons in rapid succession — e.g. RIGHT then LEFT while moving UP — both passed the guard and were queued. On the next tick the snake would attempt to reverse direction, causing an immediate self-collision. Fix: the guard now checks the tail of the direction queue, so no two queued inputs can be mutually opposite.

Fixed in both `handlePress` (host local input) and the `direction` broadcast listener (non-host inputs arriving at the host).

### Fix: direction button shows question mark

The multiplayer direction button displayed Unicode arrow characters (↑ → ↓ ←) which JetBrains Mono doesn't support, rendering them as `?`. Replaced with SVG arrow icons (rotate-transform of a single up-arrow path).

---

## v1.8.0 — 2026-03-20

### Latency & reliability improvements

**Tick rate 250ms → 200ms** — reduces worst-case input latency for non-host players by ~50ms (from 350ms to 300ms worst case; 225ms → 175ms average). Speed curve adjusted to maintain the same difficulty ramp.

**Dynamic channel ref in tick loop** — `channelRef.current` is now read on every tick instead of being captured once at `startTick()` call time. Ensures the most-current channel is always used and future-proofs any reconnect path.

**`request_game_state` resync for non-hosts** — when a non-host player returns from a backgrounded tab, they now immediately broadcast a `request_game_state` event. The host responds with the current game state, eliminating the gap where stale state could persist until the next scheduled tick.

**Waiting room: host slot now labeled "Host"** — slot 0 previously showed "Joined" for other players. Now correctly shows "Host" so the room layout is unambiguous.

**Removed `pausedAtRef` dead code** — was declared and set but never read.

---

## v1.7.1 — 2026-03-20

### Fix: multiplayer game freezing on first button tap

The multiplayer direction button used `onPointerDown={handlePress}` — passing the raw browser `PointerEvent` object as the direction argument. Since a PointerEvent is not `null`, `handlePress` treated it as the direction, pushed it into the direction queue, and when the game tick tried to look up `DIR_VECTORS[PointerEvent]` it got `undefined`. Destructuring `undefined` threw a `TypeError`, killing the tick loop permanently.

Fix: changed to `onPointerDown={() => handlePress()}` so no argument is passed. When `explicitDir` is `undefined`, `handlePress` correctly falls back to `DIRECTIONS[slot]` (the player's assigned direction).

Also added a `DIRECTIONS.includes(dir)` guard in the direction broadcast listener so malformed network payloads (e.g. a serialized PointerEvent arriving as `{}`) are silently dropped instead of crashing the host tick.

---

## v1.7.0 — 2026-03-20

### Multiplayer stability & iOS hang fix

**Direction input queue** — replaced the single-slot `nextDirRef` with a capped queue (max 3 inputs). Previously, a direction input arriving at the exact moment the tick consumed it could be silently dropped. The queue drains one input per tick, so fast taps are reliably registered.

**Tick deduplication + drift correction** — the game loop body was copy-pasted in two places (`useEffect` and `handleRestart`). Extracted into a shared `startTick()` function. Also added drift correction: the actual time spent per tick is subtracted from the next delay, preventing cumulative timing drift over long sessions.

**Visibility pause/resume (iOS hang fix)** — on iOS, app-switching or backgrounding caused `setTimeout` to keep ticking while the canvas froze (RAF stalled), producing a "jump" when focus returned. The host now stops the tick loop when the tab is hidden and restarts cleanly when it comes back into view. Handles both `visibilitychange` and `pagehide`/`pageshow` events.

**Channel reconnect banner** — if the Supabase channel errors, times out, or closes, a red "RECONNECTING..." banner appears at the top of the screen and the channel automatically resubscribes after 2 seconds. Non-host players also resubscribe if their channel is found closed on tab return.

**AudioContext recovery** — added a `statechange` listener to resume the AudioContext if iOS suspends it mid-game. The audio `_tick()` scheduler also clamps `_next` to prevent a burst of queued steps firing all at once after a suspend/resume.

**Supabase worker heartbeat** — added `worker: true` to the channel config, which runs the Supabase heartbeat in a Web Worker. Reduces the risk of iOS background throttling killing the channel connection.

---

## v1.6.0 — 2026-03-20

### Back button on waiting room
Added a "Back" button to the multiplayer waiting room. Returns to the lobby and cleans up the Supabase channel. Works for both host and joined players.

### Quit button after game over
Added a "Quit" button that appears on the game-over screen for all players (alongside the host's "Play Again" button). Returns to the lobby and fully resets session state.

---

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

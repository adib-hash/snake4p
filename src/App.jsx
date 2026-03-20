import { useState, useEffect, useRef } from "react";
import { createClient } from "@supabase/supabase-js";

// ── CONFIG ──────────────────────────────────────────────────────────
const GRID = 20;
const TICK_MS = 150;

// ▼▼▼ PASTE YOUR SUPABASE CREDENTIALS HERE ▼▼▼
const SUPABASE_URL = "https://mohudogfrkucjevydtko.supabase.co";
const SUPABASE_KEY = "PASTE_YOUR_LEGACY_ANON_KEY_HERE";
// ▲▲▲ Go to Supabase → Project Settings → API → Legacy anon key ▲▲▲

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const DIRECTIONS = ["UP", "RIGHT", "DOWN", "LEFT"];
const DIR_LABELS = ["↑", "→", "↓", "←"];
const DIR_VECTORS = {
  UP: [0, -1],
  RIGHT: [1, 0],
  DOWN: [0, 1],
  LEFT: [-1, 0],
};
const DIR_COLORS = ["#E85D75", "#F0A644", "#4ECDC4", "#7B68EE"];
const DIR_NAMES = ["Up", "Right", "Down", "Left"];
const OPPOSITES = { UP: "DOWN", DOWN: "UP", LEFT: "RIGHT", RIGHT: "LEFT" };

// ── GAME LOGIC (pure) ───────────────────────────────────────────────
function spawnFood(snake) {
  const occ = new Set(snake.map(([x, y]) => `${x},${y}`));
  let pos;
  let tries = 0;
  do {
    pos = [Math.floor(Math.random() * GRID), Math.floor(Math.random() * GRID)];
    tries++;
  } while (occ.has(`${pos[0]},${pos[1]}`) && tries < 500);
  return pos;
}

function initGame() {
  const snake = [
    [10, 10],
    [9, 10],
    [8, 10],
  ];
  return {
    snake,
    direction: "RIGHT",
    food: spawnFood(snake),
    score: 0,
    gameOver: false,
  };
}

function gameTick(state, nextDir) {
  if (state.gameOver) return state;
  const dir = nextDir || state.direction;
  const [dx, dy] = DIR_VECTORS[dir];
  const [hx, hy] = state.snake[0];
  const nx = (hx + dx + GRID) % GRID;
  const ny = (hy + dy + GRID) % GRID;

  if (state.snake.some(([sx, sy]) => sx === nx && sy === ny)) {
    return { ...state, gameOver: true, direction: dir };
  }

  const newSnake = [[nx, ny], ...state.snake];
  let food = state.food;
  let score = state.score;
  if (nx === food[0] && ny === food[1]) {
    score++;
    food = spawnFood(newSnake);
  } else {
    newSnake.pop();
  }
  return { snake: newSnake, direction: dir, food, score, gameOver: false };
}

// ── CANVAS RENDERER ─────────────────────────────────────────────────
function GameBoard({ state, cellSize }) {
  const canvasRef = useRef(null);
  const animRef = useRef(null);

  useEffect(() => {
    let running = true;

    function draw() {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      const size = GRID * cellSize;
      canvas.width = size;
      canvas.height = size;

      const { snake, food, gameOver, score } = state;

      ctx.fillStyle = "#0a0a0f";
      ctx.fillRect(0, 0, size, size);

      ctx.strokeStyle = "rgba(255,255,255,0.03)";
      ctx.lineWidth = 0.5;
      for (let i = 0; i <= GRID; i++) {
        ctx.beginPath();
        ctx.moveTo(i * cellSize, 0);
        ctx.lineTo(i * cellSize, size);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, i * cellSize);
        ctx.lineTo(size, i * cellSize);
        ctx.stroke();
      }

      const t = Date.now() / 400;
      const glow = 8 + Math.sin(t) * 4;
      ctx.shadowColor = "#ff6b6b";
      ctx.shadowBlur = glow;
      ctx.fillStyle = "#ff6b6b";
      ctx.beginPath();
      ctx.arc(
        food[0] * cellSize + cellSize / 2,
        food[1] * cellSize + cellSize / 2,
        cellSize * 0.35,
        0,
        Math.PI * 2
      );
      ctx.fill();
      ctx.shadowBlur = 0;

      snake.forEach(([x, y], i) => {
        const ratio = i / Math.max(snake.length - 1, 1);
        const r = Math.round(78 + (30 - 78) * ratio);
        const g = Math.round(205 + (200 - 205) * ratio);
        const b = Math.round(196 + (255 - 196) * ratio);
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        const pad = i === 0 ? 0.5 : 1;
        const radius = i === 0 ? cellSize * 0.15 : cellSize * 0.1;
        const rx = x * cellSize + pad;
        const ry = y * cellSize + pad;
        const rw = cellSize - pad * 2;
        const rh = cellSize - pad * 2;
        ctx.beginPath();
        ctx.moveTo(rx + radius, ry);
        ctx.lineTo(rx + rw - radius, ry);
        ctx.quadraticCurveTo(rx + rw, ry, rx + rw, ry + radius);
        ctx.lineTo(rx + rw, ry + rh - radius);
        ctx.quadraticCurveTo(rx + rw, ry + rh, rx + rw - radius, ry + rh);
        ctx.lineTo(rx + radius, ry + rh);
        ctx.quadraticCurveTo(rx, ry + rh, rx, ry + rh - radius);
        ctx.lineTo(rx, ry + radius);
        ctx.quadraticCurveTo(rx, ry, rx + radius, ry);
        ctx.fill();
      });

      if (gameOver) {
        ctx.fillStyle = "rgba(0,0,0,0.7)";
        ctx.fillRect(0, 0, size, size);
        ctx.fillStyle = "#E85D75";
        ctx.font = `bold ${cellSize * 1.5}px 'JetBrains Mono', monospace`;
        ctx.textAlign = "center";
        ctx.fillText("GAME OVER", size / 2, size / 2 - cellSize);
        ctx.fillStyle = "#ccc";
        ctx.font = `${cellSize * 0.7}px 'JetBrains Mono', monospace`;
        ctx.fillText(`Score: ${score}`, size / 2, size / 2 + cellSize * 0.5);
      }

      if (running && !gameOver) {
        animRef.current = requestAnimationFrame(draw);
      }
    }

    draw();
    return () => {
      running = false;
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [state, cellSize]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        borderRadius: 12,
        border: "1px solid rgba(255,255,255,0.08)",
        maxWidth: "100%",
      }}
    />
  );
}

// ── LOBBY SCREEN ────────────────────────────────────────────────────
function LobbyScreen({ onHost, onJoin }) {
  const [code, setCode] = useState("");

  return (
    <div style={styles.screenCenter}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 56, marginBottom: 8 }}>🐍</div>
        <h1 style={styles.title}>SNAKE × 4</h1>
        <p
          style={{
            color: "rgba(255,255,255,0.4)",
            fontSize: 13,
            marginTop: 8,
          }}
        >
          4 players. 1 snake. 1 button each.
        </p>
      </div>

      <button onClick={onHost} style={styles.btnPrimary}>
        Create Room
      </button>

      <div style={styles.divider}>
        <div style={styles.dividerLine} />
        <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 12 }}>
          OR
        </span>
        <div style={styles.dividerLine} />
      </div>

      <div
        style={{ display: "flex", gap: 8, width: "100%", maxWidth: 300 }}
      >
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="ROOM CODE"
          maxLength={5}
          style={styles.input}
        />
        <button
          onClick={() => code.length >= 4 && onJoin(code)}
          disabled={code.length < 4}
          style={{
            ...styles.btnJoin,
            background:
              code.length >= 4 ? "#7B68EE" : "rgba(255,255,255,0.05)",
            color:
              code.length >= 4 ? "#fff" : "rgba(255,255,255,0.2)",
            cursor: code.length >= 4 ? "pointer" : "default",
          }}
        >
          Join
        </button>
      </div>
    </div>
  );
}

// ── WAITING ROOM ────────────────────────────────────────────────────
function WaitingRoom({ roomCode, players, mySlot, isHost, onStart }) {
  const ready = players.filter(Boolean).length;

  return (
    <div style={styles.screenCenter}>
      <div
        style={{
          background: "rgba(255,255,255,0.04)",
          borderRadius: 16,
          padding: "20px 40px",
          textAlign: "center",
        }}
      >
        <div
          style={{
            fontSize: 11,
            color: "rgba(255,255,255,0.4)",
            marginBottom: 4,
          }}
        >
          ROOM CODE
        </div>
        <div
          style={{
            fontSize: 40,
            fontWeight: 800,
            letterSpacing: 10,
            color: "#4ECDC4",
          }}
        >
          {roomCode}
        </div>
      </div>

      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>
        Share this code with 3 friends
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 12,
          width: "100%",
          maxWidth: 320,
        }}
      >
        {DIRECTIONS.map((dir, i) => {
          const taken = players[i];
          const isMe = i === mySlot;
          return (
            <div
              key={dir}
              style={{
                padding: 16,
                borderRadius: 12,
                border: `2px solid ${
                  taken ? DIR_COLORS[i] : "rgba(255,255,255,0.06)"
                }`,
                background: taken
                  ? `${DIR_COLORS[i]}11`
                  : "rgba(255,255,255,0.02)",
                textAlign: "center",
                transition: "all 0.3s",
              }}
            >
              <div
                style={{
                  fontSize: 28,
                  marginBottom: 4,
                  color: taken
                    ? DIR_COLORS[i]
                    : "rgba(255,255,255,0.15)",
                }}
              >
                {DIR_LABELS[i]}
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: taken
                    ? DIR_COLORS[i]
                    : "rgba(255,255,255,0.2)",
                }}
              >
                {taken ? (isMe ? "You" : "Joined") : "Waiting..."}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>
        {ready}/4 players
      </div>

      {isHost ? (
        <button
          onClick={onStart}
          disabled={ready < 2}
          style={{
            ...styles.btnPrimary,
            opacity: ready >= 2 ? 1 : 0.3,
            cursor: ready >= 2 ? "pointer" : "default",
          }}
        >
          {ready >= 2 ? "Start Game" : "Need at least 2 players"}
        </button>
      ) : (
        <div
          style={{
            fontSize: 13,
            color: "rgba(255,255,255,0.3)",
            fontStyle: "italic",
          }}
        >
          Waiting for host to start...
        </div>
      )}
    </div>
  );
}

// ── MAIN APP ────────────────────────────────────────────────────────
export default function App() {
  const [screen, setScreen] = useState("lobby");
  const [roomCode, setRoomCode] = useState("");
  const [mySlot, setMySlot] = useState(-1);
  const [isHost, setIsHost] = useState(false);
  const [players, setPlayers] = useState([null, null, null, null]);
  const [gameState, setGameState] = useState(initGame());
  const [flashDir, setFlashDir] = useState(null);

  const channelRef = useRef(null);
  const gameRef = useRef(initGame());
  const nextDirRef = useRef(null);
  const playersRef = useRef([null, null, null, null]);
  const myIdRef = useRef(Math.random().toString(36).slice(2, 8));
  const tickRef = useRef(null);
  const isHostRef = useRef(false);
  const retryRef = useRef(null);
  const mySlotRef = useRef(-1);

  // Responsive cell size
  const [cellSize, setCellSize] = useState(16);
  useEffect(() => {
    function resize() {
      const maxW = Math.min(window.innerWidth - 32, 480);
      const maxH = window.innerHeight * 0.45;
      setCellSize(Math.floor(Math.min(maxW, maxH) / GRID));
    }
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  function genCode() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    return Array.from({ length: 5 }, () =>
      chars[Math.floor(Math.random() * chars.length)]
    ).join("");
  }

  // ── Create and subscribe to a Supabase Realtime channel ──
  function joinChannel(code) {
    const channel = supabase.channel(`snake-${code}`, {
      config: { broadcast: { self: true } },
    });

    // ── Listen: slot requests (host handles) ──
    channel.on("broadcast", { event: "request_slot" }, ({ payload }) => {
      if (!isHostRef.current) return;
      const { playerId } = payload;
      // Already seated? Re-send
      if (playersRef.current.includes(playerId)) {
        const idx = playersRef.current.indexOf(playerId);
        channel.send({
          type: "broadcast",
          event: "slot_assigned",
          payload: { slot: idx, playerId },
        });
        channel.send({
          type: "broadcast",
          event: "player_list",
          payload: { list: [...playersRef.current] },
        });
        return;
      }
      const idx = playersRef.current.indexOf(null);
      if (idx === -1) return;
      playersRef.current[idx] = playerId;
      setPlayers([...playersRef.current]);
      console.log("[snake] host: assigned slot", idx, "to", playerId);
      channel.send({
        type: "broadcast",
        event: "slot_assigned",
        payload: { slot: idx, playerId },
      });
      channel.send({
        type: "broadcast",
        event: "player_list",
        payload: { list: [...playersRef.current] },
      });
    });

    // ── Listen: sync requests (host handles) ──
    channel.on("broadcast", { event: "request_sync" }, () => {
      if (!isHostRef.current) return;
      channel.send({
        type: "broadcast",
        event: "player_list",
        payload: { list: [...playersRef.current] },
      });
    });

    // ── Listen: player list (everyone) ──
    channel.on("broadcast", { event: "player_list" }, ({ payload }) => {
      const { list } = payload;
      if (!list || !Array.isArray(list)) return;
      playersRef.current = [...list];
      setPlayers([...list]);
      const idx = list.indexOf(myIdRef.current);
      if (idx !== -1) {
        mySlotRef.current = idx;
        setMySlot(idx);
        if (retryRef.current) {
          clearInterval(retryRef.current);
          retryRef.current = null;
        }
      }
    });

    // ── Listen: slot assigned ──
    channel.on("broadcast", { event: "slot_assigned" }, ({ payload }) => {
      if (payload.playerId === myIdRef.current) {
        mySlotRef.current = payload.slot;
        setMySlot(payload.slot);
        if (retryRef.current) {
          clearInterval(retryRef.current);
          retryRef.current = null;
        }
        console.log("[snake] I got slot", payload.slot);
      }
    });

    // ── Listen: direction (host processes) ──
    channel.on("broadcast", { event: "direction" }, ({ payload }) => {
      if (!isHostRef.current) return;
      const { dir } = payload;
      const cur = gameRef.current.direction;
      if (dir && OPPOSITES[dir] !== cur) {
        nextDirRef.current = dir;
      }
    });

    // ── Listen: game state (non-host receives) ──
    channel.on("broadcast", { event: "game_state" }, ({ payload }) => {
      if (isHostRef.current) return;
      if (payload.state) {
        gameRef.current = payload.state;
        setGameState(payload.state);
      }
    });

    // ── Listen: game start ──
    channel.on("broadcast", { event: "game_start" }, () => {
      const fresh = initGame();
      gameRef.current = fresh;
      nextDirRef.current = null;
      setGameState(fresh);
      setScreen("game");
    });

    // ── Listen: restart ──
    channel.on("broadcast", { event: "game_restart" }, () => {
      const fresh = initGame();
      gameRef.current = fresh;
      nextDirRef.current = null;
      setGameState(fresh);
    });

    return channel;
  }

  // ── Host a room ──
  function handleHost() {
    const code = genCode();
    setRoomCode(code);
    setIsHost(true);
    isHostRef.current = true;
    setMySlot(0);
    mySlotRef.current = 0;

    const plist = [myIdRef.current, null, null, null];
    playersRef.current = plist;
    setPlayers([...plist]);
    setScreen("waiting");

    const ch = joinChannel(code);
    channelRef.current = ch;
<<<<<<< HEAD
    ch.subscribe((status) => {
      console.log("[snake] host channel status:", status);
    });

    console.log("[snake] hosting room", code, "myId:", myIdRef.current);
  }

  // ── Join a room ──
  function handleJoin(code) {
    setRoomCode(code);
    setIsHost(false);
    isHostRef.current = false;
    setScreen("waiting");

    const ch = joinChannel(code);
    channelRef.current = ch;

    // Once subscribed, request a slot. Retry every 2s until acknowledged.
    ch.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        console.log(
          "[snake] subscribed, requesting slot. myId:",
          myIdRef.current
        );

        const sendRequest = () => {
          ch.send({
            type: "broadcast",
            event: "request_slot",
            payload: { playerId: myIdRef.current },
          });
          ch.send({
            type: "broadcast",
            event: "request_sync",
            payload: {},
          });
        };

        sendRequest();
        retryRef.current = setInterval(() => {
          console.log("[snake] retrying slot request...");
          sendRequest();
        }, 2000);
      }
    });
  }

  // ── Start game (host) ──
  function handleStart() {
    const fresh = initGame();
    gameRef.current = fresh;
    nextDirRef.current = null;
    setGameState(fresh);
    setScreen("game");
    channelRef.current?.send({
      type: "broadcast",
      event: "game_start",
      payload: {},
    });
  }

  // ── Host game loop ──
  useEffect(() => {
    if (screen !== "game" || !isHost) return;
    const ch = channelRef.current;

    tickRef.current = setInterval(() => {
      const dir = nextDirRef.current || gameRef.current.direction;
      nextDirRef.current = null;
      const newState = gameTick(gameRef.current, dir);
      gameRef.current = newState;
      setGameState({ ...newState });
      ch.send({
        type: "broadcast",
        event: "game_state",
        payload: { state: newState },
      });

      if (newState.gameOver) {
        clearInterval(tickRef.current);
      }
    }, TICK_MS);

    return () => clearInterval(tickRef.current);
  }, [screen, isHost]);

  // ── Press my button ──
  function handlePress() {
    const slot = mySlotRef.current;
    if (slot < 0 || gameState.gameOver) return;
    const dir = DIRECTIONS[slot];

    setFlashDir(dir);
    setTimeout(() => setFlashDir(null), 120);

    if (isHostRef.current) {
      const cur = gameRef.current.direction;
      if (OPPOSITES[dir] !== cur) {
        nextDirRef.current = dir;
      }
    } else {
      channelRef.current?.send({
        type: "broadcast",
        event: "direction",
        payload: { dir },
      });
    }
  }

  // ── Restart ──
  function handleRestart() {
    const fresh = initGame();
    gameRef.current = fresh;
    nextDirRef.current = null;
    setGameState(fresh);
    channelRef.current?.send({
      type: "broadcast",
      event: "game_restart",
      payload: {},
    });

    if (tickRef.current) clearInterval(tickRef.current);
    const ch = channelRef.current;
    tickRef.current = setInterval(() => {
      const dir = nextDirRef.current || gameRef.current.direction;
      nextDirRef.current = null;
      const newState = gameTick(gameRef.current, dir);
      gameRef.current = newState;
      setGameState({ ...newState });
      ch.send({
        type: "broadcast",
        event: "game_state",
        payload: { state: newState },
      });
      if (newState.gameOver) clearInterval(tickRef.current);
    }, TICK_MS);
  }

  // ── Keyboard for testing ──
  useEffect(() => {
    function onKey(e) {
      const map = {
        ArrowUp: "UP",
        ArrowDown: "DOWN",
        ArrowLeft: "LEFT",
        ArrowRight: "RIGHT",
      };
      const dir = map[e.key];
      if (!dir || mySlotRef.current < 0) return;
      if (DIRECTIONS[mySlotRef.current] === dir) handlePress();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [gameState.gameOver]);

  // ── Cleanup ──
  useEffect(() => {
    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current);
      if (retryRef.current) clearInterval(retryRef.current);
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, []);

  // ═════════════════════════════════════════════════════════════════
  // RENDER
  // ═════════════════════════════════════════════════════════════════

  if (screen === "lobby") {
    return <LobbyScreen onHost={handleHost} onJoin={handleJoin} />;
  }

  if (screen === "waiting") {
    return (
      <WaitingRoom
        roomCode={roomCode}
        players={players}
        mySlot={mySlot}
        isHost={isHost}
        onStart={handleStart}
      />
    );
  }

  const myDir = mySlot >= 0 ? DIRECTIONS[mySlot] : null;
  const myColor = mySlot >= 0 ? DIR_COLORS[mySlot] : "#888";

  return (
    <div style={styles.gameScreen}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          width: "100%",
          maxWidth: GRID * cellSize,
        }}
      >
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>
          {roomCode}
        </div>
        <div style={{ fontSize: 22, fontWeight: 800, color: "#4ECDC4" }}>
          {gameState.score}
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {DIRECTIONS.map((_, i) => (
            <div
              key={i}
              style={{
                width: 10,
                height: 10,
                borderRadius: 5,
                background: players[i]
                  ? DIR_COLORS[i]
                  : "rgba(255,255,255,0.08)",
                border:
                  i === mySlot
                    ? "2px solid #fff"
                    : "2px solid transparent",
              }}
            />
          ))}
        </div>
      </div>

      <GameBoard state={gameState} cellSize={cellSize} />

      <div
        style={{ width: "100%", maxWidth: GRID * cellSize, marginTop: 8 }}
      >
        <div
          style={{
            fontSize: 10,
            color: "rgba(255,255,255,0.25)",
            textAlign: "center",
            marginBottom: 6,
            textTransform: "uppercase",
            letterSpacing: 2,
          }}
        >
          Your control
        </div>
        <button
          onPointerDown={handlePress}
          style={{
            width: "100%",
            height: 110,
            borderRadius: 16,
            border: `3px solid ${myColor}`,
            background:
              flashDir === myDir
                ? `${myColor}33`
                : "rgba(255,255,255,0.03)",
            color: myColor,
            fontSize: 48,
            fontFamily: "'JetBrains Mono', monospace",
            cursor: "pointer",
            transition: "background 0.1s",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
            userSelect: "none",
            WebkitTapHighlightColor: "transparent",
            outline: "none",
          }}
        >
          {mySlot >= 0 ? DIR_LABELS[mySlot] : "?"}
          <span style={{ fontSize: 16, opacity: 0.5 }}>
            {mySlot >= 0 ? DIR_NAMES[mySlot] : ""}
          </span>
        </button>
      </div>

      {gameState.gameOver && isHost && (
        <button
          onClick={handleRestart}
          style={{ ...styles.btnPrimary, marginTop: 12 }}
        >
          Play Again
        </button>
      )}
      {gameState.gameOver && !isHost && (
        <div
          style={{
            fontSize: 13,
            color: "rgba(255,255,255,0.3)",
            marginTop: 12,
          }}
        >
          Waiting for host to restart...
        </div>
      )}
    </div>
  );
}

// ── STYLES ──────────────────────────────────────────────────────────
const styles = {
  screenCenter: {
    minHeight: "100dvh",
    background: "#0a0a0f",
    color: "#eee",
    fontFamily: "'JetBrains Mono', monospace",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 28,
  },
  gameScreen: {
    minHeight: "100dvh",
    background: "#0a0a0f",
    color: "#eee",
    fontFamily: "'JetBrains Mono', monospace",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "16px 16px 40px",
    gap: 12,
    userSelect: "none",
  },
  title: {
    fontSize: 32,
    fontWeight: 800,
    background: "linear-gradient(135deg, #4ECDC4, #7B68EE)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
    margin: 0,
  },
  btnPrimary: {
    width: "100%",
    maxWidth: 300,
    padding: "16px 24px",
    borderRadius: 12,
    border: "none",
    background: "linear-gradient(135deg, #4ECDC4, #45b7aa)",
    color: "#0a0a0f",
    fontSize: 16,
    fontWeight: 700,
    fontFamily: "'JetBrains Mono', monospace",
    cursor: "pointer",
  },
  btnJoin: {
    padding: "14px 20px",
    borderRadius: 12,
    border: "none",
    fontSize: 16,
    fontFamily: "'JetBrains Mono', monospace",
    fontWeight: 700,
  },
  input: {
    flex: 1,
    padding: "14px 16px",
    borderRadius: 12,
    border: "2px solid rgba(255,255,255,0.1)",
    background: "rgba(255,255,255,0.03)",
    color: "#eee",
    fontSize: 18,
    fontFamily: "'JetBrains Mono', monospace",
    textAlign: "center",
    letterSpacing: 6,
    outline: "none",
  },
  divider: {
    display: "flex",
    alignItems: "center",
    gap: 16,
    width: "100%",
    maxWidth: 300,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    background: "rgba(255,255,255,0.1)",
  },
};

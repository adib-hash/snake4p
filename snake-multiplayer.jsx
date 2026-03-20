import { useState, useEffect, useRef, useCallback } from "react";

// ── CONFIG ──────────────────────────────────────────────────────────
const GRID = 20;
const TICK_MS = 150;
const SUPABASE_URL = "https://YOUR_PROJECT.supabase.co"; // Replace with your Supabase URL
const SUPABASE_KEY = "YOUR_ANON_KEY"; // Replace with your anon key

const DIRECTIONS = ["UP", "RIGHT", "DOWN", "LEFT"];
const DIR_LABELS = ["↑", "→", "↓", "←"];
const DIR_VECTORS = { UP: [0, -1], RIGHT: [1, 0], DOWN: [0, 1], LEFT: [-1, 0] };
const DIR_COLORS = ["#E85D75", "#F0A644", "#4ECDC4", "#7B68EE"];
const DIR_NAMES = ["Up", "Right", "Down", "Left"];

// ── SUPABASE REALTIME (minimal client) ──────────────────────────────
// We use Supabase Realtime Broadcast via WebSocket directly to avoid
// needing the full SDK. This keeps it as a single-file artifact.

function createChannel(roomCode) {
  const wsUrl = SUPABASE_URL.replace("https://", "wss://") + "/realtime/v1/websocket?apikey=" + SUPABASE_KEY + "&vsn=1.0.0";
  let ws = null;
  let heartbeatRef = 0;
  let heartbeatTimer = null;
  const listeners = {};
  const topic = `realtime:snake-${roomCode}`;

  function on(event, cb) {
    if (!listeners[event]) listeners[event] = [];
    listeners[event].push(cb);
  }

  function emit(event, payload) {
    (listeners[event] || []).forEach(cb => cb(payload));
  }

  function send(event, payload) {
    if (ws && ws.readyState === 1) {
      ws.send(JSON.stringify({
        topic,
        event,
        payload,
        ref: String(++heartbeatRef)
      }));
    }
  }

  function connect() {
    ws = new WebSocket(wsUrl);
    ws.onopen = () => {
      // Join the channel
      ws.send(JSON.stringify({
        topic,
        event: "phx_join",
        payload: { config: { broadcast: { self: true } } },
        ref: String(++heartbeatRef)
      }));
      // Heartbeat
      heartbeatTimer = setInterval(() => {
        ws.send(JSON.stringify({
          topic: "phoenix",
          event: "heartbeat",
          payload: {},
          ref: String(++heartbeatRef)
        }));
      }, 30000);
    };
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.event === "broadcast") {
          const { type, ...rest } = msg.payload;
          emit(type, rest);
        }
        if (msg.event === "phx_reply" && msg.payload?.status === "ok" && msg.ref === "1") {
          emit("joined", {});
        }
      } catch {}
    };
    ws.onclose = () => {
      clearInterval(heartbeatTimer);
      // Auto-reconnect
      setTimeout(connect, 1500);
    };
  }

  function broadcast(type, data) {
    send("broadcast", { type, event: "broadcast", payload: { type, ...data } });
  }

  function disconnect() {
    clearInterval(heartbeatTimer);
    if (ws) ws.close();
  }

  connect();
  return { on, broadcast, disconnect, send };
}

// ── GAME LOGIC (pure functions) ─────────────────────────────────────
function spawnFood(snake) {
  const occupied = new Set(snake.map(([x, y]) => `${x},${y}`));
  let pos;
  do {
    pos = [Math.floor(Math.random() * GRID), Math.floor(Math.random() * GRID)];
  } while (occupied.has(`${pos[0]},${pos[1]}`));
  return pos;
}

function initGame() {
  const snake = [[10, 10], [9, 10], [8, 10]];
  return {
    snake,
    direction: "RIGHT",
    food: spawnFood(snake),
    score: 0,
    gameOver: false,
  };
}

function tick(state, nextDir) {
  if (state.gameOver) return state;
  const dir = nextDir || state.direction;
  const [dx, dy] = DIR_VECTORS[dir];
  const [hx, hy] = state.snake[0];
  const nx = (hx + dx + GRID) % GRID;
  const ny = (hy + dy + GRID) % GRID;

  // Self-collision
  if (state.snake.some(([sx, sy]) => sx === nx && sy === ny)) {
    return { ...state, gameOver: true };
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

// ── COMPONENTS ──────────────────────────────────────────────────────

function GameBoard({ state, cellSize }) {
  const { snake, food, gameOver } = state;
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const size = GRID * cellSize;
    canvas.width = size;
    canvas.height = size;

    // Background
    ctx.fillStyle = "#0a0a0f";
    ctx.fillRect(0, 0, size, size);

    // Grid lines (subtle)
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

    // Food (pulsing glow)
    const t = Date.now() / 400;
    const glow = 8 + Math.sin(t) * 4;
    ctx.shadowColor = "#ff6b6b";
    ctx.shadowBlur = glow;
    ctx.fillStyle = "#ff6b6b";
    ctx.beginPath();
    ctx.arc(food[0] * cellSize + cellSize / 2, food[1] * cellSize + cellSize / 2, cellSize * 0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Snake
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

    // Game over overlay
    if (gameOver) {
      ctx.fillStyle = "rgba(0,0,0,0.7)";
      ctx.fillRect(0, 0, size, size);
      ctx.fillStyle = "#E85D75";
      ctx.font = `bold ${cellSize * 1.5}px 'JetBrains Mono', monospace`;
      ctx.textAlign = "center";
      ctx.fillText("GAME OVER", size / 2, size / 2 - cellSize);
      ctx.fillStyle = "#ccc";
      ctx.font = `${cellSize * 0.7}px 'JetBrains Mono', monospace`;
      ctx.fillText(`Score: ${state.score}`, size / 2, size / 2 + cellSize * 0.5);
    }
  }, [state, cellSize]);

  return <canvas ref={canvasRef} style={{ borderRadius: 12, border: "1px solid rgba(255,255,255,0.08)" }} />;
}

function ControlButton({ dir, active, onPress, assigned }) {
  const idx = DIRECTIONS.indexOf(dir);
  return (
    <button
      onPointerDown={onPress}
      style={{
        width: "100%",
        maxWidth: 320,
        height: 120,
        borderRadius: 16,
        border: assigned ? `3px solid ${DIR_COLORS[idx]}` : "2px solid rgba(255,255,255,0.1)",
        background: active
          ? `${DIR_COLORS[idx]}22`
          : "rgba(255,255,255,0.03)",
        color: assigned ? DIR_COLORS[idx] : "rgba(255,255,255,0.3)",
        fontSize: 48,
        fontFamily: "'JetBrains Mono', monospace",
        cursor: assigned ? "pointer" : "default",
        transition: "all 0.15s",
        opacity: assigned ? 1 : 0.3,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        userSelect: "none",
        WebkitTapHighlightColor: "transparent",
      }}
      disabled={!assigned}
    >
      {DIR_LABELS[idx]}
      <span style={{ fontSize: 16, opacity: 0.6 }}>{DIR_NAMES[idx]}</span>
    </button>
  );
}

// ── SCREENS ─────────────────────────────────────────────────────────

function LobbyScreen({ onHost, onJoin }) {
  const [code, setCode] = useState("");

  return (
    <div style={{
      minHeight: "100dvh",
      background: "#0a0a0f",
      color: "#eee",
      fontFamily: "'JetBrains Mono', monospace",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
      gap: 32,
    }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 56, marginBottom: 8 }}>🐍</div>
        <h1 style={{
          fontSize: 32,
          fontWeight: 800,
          background: "linear-gradient(135deg, #4ECDC4, #7B68EE)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          margin: 0,
        }}>
          SNAKE × 4
        </h1>
        <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, marginTop: 8 }}>
          4 players. 1 snake. 1 button each.
        </p>
      </div>

      <button
        onClick={onHost}
        style={{
          width: "100%",
          maxWidth: 300,
          padding: "16px 24px",
          borderRadius: 12,
          border: "none",
          background: "linear-gradient(135deg, #4ECDC4, #45b7aa)",
          color: "#0a0a0f",
          fontSize: 16,
          fontWeight: 700,
          fontFamily: "inherit",
          cursor: "pointer",
        }}
      >
        Create Room
      </button>

      <div style={{ display: "flex", alignItems: "center", gap: 16, width: "100%", maxWidth: 300 }}>
        <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.1)" }} />
        <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 12 }}>OR</span>
        <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.1)" }} />
      </div>

      <div style={{ display: "flex", gap: 8, width: "100%", maxWidth: 300 }}>
        <input
          value={code}
          onChange={e => setCode(e.target.value.toUpperCase())}
          placeholder="ROOM CODE"
          maxLength={5}
          style={{
            flex: 1,
            padding: "14px 16px",
            borderRadius: 12,
            border: "2px solid rgba(255,255,255,0.1)",
            background: "rgba(255,255,255,0.03)",
            color: "#eee",
            fontSize: 18,
            fontFamily: "inherit",
            textAlign: "center",
            letterSpacing: 6,
            outline: "none",
          }}
        />
        <button
          onClick={() => code.length >= 4 && onJoin(code)}
          disabled={code.length < 4}
          style={{
            padding: "14px 20px",
            borderRadius: 12,
            border: "none",
            background: code.length >= 4 ? "#7B68EE" : "rgba(255,255,255,0.05)",
            color: code.length >= 4 ? "#fff" : "rgba(255,255,255,0.2)",
            fontSize: 16,
            fontFamily: "inherit",
            fontWeight: 700,
            cursor: code.length >= 4 ? "pointer" : "default",
          }}
        >
          Join
        </button>
      </div>
    </div>
  );
}

function WaitingRoom({ roomCode, players, mySlot, isHost, onStart }) {
  return (
    <div style={{
      minHeight: "100dvh",
      background: "#0a0a0f",
      color: "#eee",
      fontFamily: "'JetBrains Mono', monospace",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
      gap: 24,
    }}>
      <div style={{
        background: "rgba(255,255,255,0.04)",
        borderRadius: 16,
        padding: "20px 40px",
        textAlign: "center",
      }}>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 4 }}>ROOM CODE</div>
        <div style={{ fontSize: 40, fontWeight: 800, letterSpacing: 10, color: "#4ECDC4" }}>
          {roomCode}
        </div>
      </div>

      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>
        Share this code with 3 friends
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 12,
        width: "100%",
        maxWidth: 320,
      }}>
        {DIRECTIONS.map((dir, i) => {
          const taken = players[i];
          const isMe = i === mySlot;
          return (
            <div key={dir} style={{
              padding: 16,
              borderRadius: 12,
              border: `2px solid ${taken ? DIR_COLORS[i] : "rgba(255,255,255,0.06)"}`,
              background: taken ? `${DIR_COLORS[i]}11` : "rgba(255,255,255,0.02)",
              textAlign: "center",
              transition: "all 0.3s",
            }}>
              <div style={{ fontSize: 28, marginBottom: 4, color: taken ? DIR_COLORS[i] : "rgba(255,255,255,0.15)" }}>
                {DIR_LABELS[i]}
              </div>
              <div style={{ fontSize: 12, color: taken ? DIR_COLORS[i] : "rgba(255,255,255,0.2)" }}>
                {taken ? (isMe ? "You" : "Joined") : "Empty"}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", marginTop: 8 }}>
        {players.filter(Boolean).length}/4 players
      </div>

      {isHost && (
        <button
          onClick={onStart}
          disabled={players.filter(Boolean).length < 1}
          style={{
            marginTop: 8,
            padding: "14px 48px",
            borderRadius: 12,
            border: "none",
            background: players.filter(Boolean).length >= 1
              ? "linear-gradient(135deg, #4ECDC4, #45b7aa)"
              : "rgba(255,255,255,0.05)",
            color: players.filter(Boolean).length >= 1 ? "#0a0a0f" : "rgba(255,255,255,0.2)",
            fontSize: 16,
            fontWeight: 700,
            fontFamily: "inherit",
            cursor: players.filter(Boolean).length >= 1 ? "pointer" : "default",
          }}
        >
          Start Game
        </button>
      )}

      {!isHost && (
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.3)", fontStyle: "italic" }}>
          Waiting for host to start...
        </div>
      )}
    </div>
  );
}

// ── MAIN APP ────────────────────────────────────────────────────────

export default function App() {
  const [screen, setScreen] = useState("lobby"); // lobby | waiting | game
  const [roomCode, setRoomCode] = useState("");
  const [mySlot, setMySlot] = useState(-1); // 0=UP, 1=RIGHT, 2=DOWN, 3=LEFT
  const [isHost, setIsHost] = useState(false);
  const [players, setPlayers] = useState([null, null, null, null]); // player IDs per slot
  const [gameState, setGameState] = useState(initGame());
  const [flashDir, setFlashDir] = useState(null);

  const channelRef = useRef(null);
  const gameRef = useRef(initGame());
  const nextDirRef = useRef(null);
  const playersRef = useRef([null, null, null, null]);
  const myIdRef = useRef(Math.random().toString(36).slice(2, 8));
  const tickRef = useRef(null);

  // ── Cell size (responsive) ──
  const [cellSize, setCellSize] = useState(16);
  useEffect(() => {
    function resize() {
      const maxW = Math.min(window.innerWidth - 32, 480);
      const maxH = window.innerHeight * 0.5;
      setCellSize(Math.floor(Math.min(maxW, maxH) / GRID));
    }
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  // ── Generate room code ──
  function genCode() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    return Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  }

  // ── Setup channel listeners ──
  function setupChannel(ch, asHost) {
    ch.on("player_join", ({ slot, playerId }) => {
      playersRef.current = [...playersRef.current];
      playersRef.current[slot] = playerId;
      setPlayers([...playersRef.current]);
    });

    ch.on("player_list", ({ list }) => {
      playersRef.current = list;
      setPlayers([...list]);
    });

    ch.on("request_sync", () => {
      if (asHost) {
        ch.broadcast("player_list", { list: playersRef.current });
      }
    });

    ch.on("direction", ({ dir }) => {
      nextDirRef.current = dir;
    });

    ch.on("game_state", ({ state }) => {
      gameRef.current = state;
      setGameState(state);
    });

    ch.on("game_start", () => {
      const fresh = initGame();
      gameRef.current = fresh;
      nextDirRef.current = null;
      setGameState(fresh);
      setScreen("game");
    });

    ch.on("game_restart", () => {
      const fresh = initGame();
      gameRef.current = fresh;
      nextDirRef.current = null;
      setGameState(fresh);
    });
  }

  // ── Host a room ──
  function handleHost() {
    const code = genCode();
    setRoomCode(code);
    setIsHost(true);
    setMySlot(0);
    const plist = [myIdRef.current, null, null, null];
    playersRef.current = plist;
    setPlayers([...plist]);
    setScreen("waiting");

    const ch = createChannel(code);
    channelRef.current = ch;
    setupChannel(ch, true);

    ch.on("joined", () => {
      // Broadcast initial state when a new player triggers sync
    });
  }

  // ── Join a room ──
  function handleJoin(code) {
    setRoomCode(code);
    setIsHost(false);
    setScreen("waiting");

    const ch = createChannel(code);
    channelRef.current = ch;
    setupChannel(ch, false);

    ch.on("joined", () => {
      // Request current player list from host
      setTimeout(() => {
        ch.broadcast("request_sync", {});
      }, 500);
    });

    // Listen for slot assignment
    ch.on("slot_assigned", ({ slot, playerId }) => {
      if (playerId === myIdRef.current) {
        setMySlot(slot);
      }
    });

    // Request a slot
    ch.on("player_list", ({ list }) => {
      playersRef.current = list;
      setPlayers([...list]);
      // If we don't have a slot yet, request one
      if (list.indexOf(myIdRef.current) === -1) {
        ch.broadcast("request_slot", { playerId: myIdRef.current });
      } else {
        setMySlot(list.indexOf(myIdRef.current));
      }
    });

    // Host handles slot requests
    // (but this player isn't host, so host needs to listen)
  }

  // ── Host: handle slot requests ──
  useEffect(() => {
    if (!isHost || !channelRef.current) return;
    const ch = channelRef.current;
    ch.on("request_slot", ({ playerId }) => {
      const idx = playersRef.current.indexOf(null);
      if (idx !== -1 && !playersRef.current.includes(playerId)) {
        playersRef.current[idx] = playerId;
        setPlayers([...playersRef.current]);
        ch.broadcast("player_join", { slot: idx, playerId });
        ch.broadcast("slot_assigned", { slot: idx, playerId });
        ch.broadcast("player_list", { list: [...playersRef.current] });
      }
    });
  }, [isHost]);

  // ── Host: game loop ──
  useEffect(() => {
    if (screen !== "game" || !isHost) return;
    const ch = channelRef.current;

    tickRef.current = setInterval(() => {
      const next = nextDirRef.current;
      // Prevent reversing
      const cur = gameRef.current.direction;
      let dir = next;
      if (dir) {
        const ci = DIRECTIONS.indexOf(cur);
        const ni = DIRECTIONS.indexOf(dir);
        if (Math.abs(ci - ni) === 2) dir = null; // Opposite direction
      }
      const newState = tick(gameRef.current, dir || gameRef.current.direction);
      gameRef.current = newState;
      nextDirRef.current = null;
      setGameState({ ...newState });
      ch.broadcast("game_state", { state: newState });
    }, TICK_MS);

    return () => clearInterval(tickRef.current);
  }, [screen, isHost]);

  // ── Press direction ──
  function handlePress() {
    if (mySlot < 0) return;
    const dir = DIRECTIONS[mySlot];
    setFlashDir(dir);
    setTimeout(() => setFlashDir(null), 150);

    if (isHost) {
      nextDirRef.current = dir;
    } else {
      channelRef.current?.broadcast("direction", { dir });
    }
  }

  // ── Start game (host only) ──
  function handleStart() {
    const fresh = initGame();
    gameRef.current = fresh;
    setGameState(fresh);
    setScreen("game");
    channelRef.current?.broadcast("game_start", {});
  }

  // ── Restart ──
  function handleRestart() {
    const fresh = initGame();
    gameRef.current = fresh;
    nextDirRef.current = null;
    setGameState(fresh);
    channelRef.current?.broadcast("game_restart", {});
  }

  // ── RENDER ────────────────────────────────────────────────────────
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

  // Game screen
  return (
    <div style={{
      minHeight: "100dvh",
      background: "#0a0a0f",
      color: "#eee",
      fontFamily: "'JetBrains Mono', monospace",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      padding: "16px 16px 32px",
      gap: 16,
      userSelect: "none",
    }}>
      {/* Header */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        width: "100%",
        maxWidth: GRID * cellSize,
      }}>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>
          ROOM: {roomCode}
        </div>
        <div style={{
          fontSize: 20,
          fontWeight: 800,
          color: "#4ECDC4",
        }}>
          {gameState.score}
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {DIRECTIONS.map((d, i) => (
            <div key={d} style={{
              width: 8,
              height: 8,
              borderRadius: 4,
              background: players[i] ? DIR_COLORS[i] : "rgba(255,255,255,0.1)",
              border: i === mySlot ? "1.5px solid #fff" : "none",
            }} />
          ))}
        </div>
      </div>

      {/* Board */}
      <GameBoard state={gameState} cellSize={cellSize} />

      {/* Your control */}
      <div style={{ width: "100%", maxWidth: GRID * cellSize, marginTop: 8 }}>
        <div style={{
          fontSize: 11,
          color: "rgba(255,255,255,0.3)",
          textAlign: "center",
          marginBottom: 8,
        }}>
          YOUR CONTROL
        </div>
        <ControlButton
          dir={DIRECTIONS[mySlot] || "UP"}
          active={flashDir === DIRECTIONS[mySlot]}
          onPress={handlePress}
          assigned={mySlot >= 0}
        />
      </div>

      {/* Game over actions */}
      {gameState.gameOver && isHost && (
        <button
          onClick={handleRestart}
          style={{
            marginTop: 8,
            padding: "12px 36px",
            borderRadius: 12,
            border: "none",
            background: "#4ECDC4",
            color: "#0a0a0f",
            fontSize: 14,
            fontWeight: 700,
            fontFamily: "inherit",
            cursor: "pointer",
          }}
        >
          Play Again
        </button>
      )}
    </div>
  );
}

import { useState, useEffect, useRef } from "react";
import { createClient } from "@supabase/supabase-js";

// ── CONFIG ──────────────────────────────────────────────────────────
const GRID = 20;
const TICK_MS = 200; // starting tick speed (ms); speeds up as score rises

// ▼▼▼ PASTE YOUR SUPABASE CREDENTIALS HERE ▼▼▼
const SUPABASE_URL = "https://fipnujvxhcqsgxqqxrxn.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZpcG51anZ4aGNxc2d4cXF4cnhuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5NzcxOTMsImV4cCI6MjA4OTU1MzE5M30.mWq9dv2tV8yBgzJmXdkzb0RAHK2BCNjND8cdmGRaxwI";
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

// ── AUDIO ENGINE ────────────────────────────────────────────────────
class LoFiEngine {
  constructor() {
    this.ctx = null;
    this.running = false;
    this.muted = false;
    this._timer = null;
    this._step = 0;
    this._next = 0;
    this._stepDur = 60 / 130 / 4; // 16th note at 130 BPM
  }

  init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
    this.ctx.onstatechange = () => {
      if (this.ctx.state === "suspended" && this.running) this.ctx.resume();
    };
  }

  start() {
    this.stop();
    this.init();
    this.running = true;
    this._step = 0;
    this._next = this.ctx.currentTime + 0.05;
    this._tick();
  }

  stop() {
    this.running = false;
    if (this._timer) { clearTimeout(this._timer); this._timer = null; }
  }

  setMuted(v) { this.muted = v; }

  _tick() {
    if (!this.running) return;
    // Clamp _next to avoid burst playback after a suspend/resume freeze
    if (this._next < this.ctx.currentTime - 0.1) {
      this._next = this.ctx.currentTime + 0.05;
    }
    while (this._next < this.ctx.currentTime + 0.1) {
      this._step16(this._step, this._next);
      this._step = (this._step + 1) % 16;
      this._next += this._stepDur;
    }
    this._timer = setTimeout(() => this._tick(), 20);
  }

  _step16(s, t) {
    if (s % 4 === 0) this._kick(t);
    if (s === 2 || s === 10 || s === 14) this._hat(t, false);
    if (s === 6) this._hat(t, true);
    this._bass(s, t);
    if (s === 0) this._pad(t);
  }

  _kick(t) {
    if (this.muted) return;
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.connect(g); g.connect(c.destination);
    o.frequency.setValueAtTime(160, t);
    o.frequency.exponentialRampToValueAtTime(28, t + 0.12);
    g.gain.setValueAtTime(2, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
    o.start(t); o.stop(t + 0.28);
  }

  _hat(t, open) {
    if (this.muted) return;
    const c = this.ctx, dur = open ? 0.1 : 0.03;
    const n = Math.ceil(c.sampleRate * dur);
    const buf = c.createBuffer(1, n, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource(), hp = c.createBiquadFilter(), g = c.createGain();
    src.buffer = buf;
    hp.type = "highpass"; hp.frequency.value = 7500;
    src.connect(hp); hp.connect(g); g.connect(c.destination);
    g.gain.setValueAtTime(open ? 0.28 : 0.2, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.start(t); src.stop(t + dur);
  }

  _bass(s, t) {
    if (this.muted) return;
    const F = [55, 0, 0, 0, 55, 0, 82.4, 0, 55, 0, 0, 0, 73.4, 0, 82.4, 0];
    const freq = F[s]; if (!freq) return;
    const c = this.ctx, o = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain();
    o.type = "sawtooth"; o.frequency.value = freq;
    f.type = "lowpass";
    f.frequency.setValueAtTime(700, t);
    f.frequency.exponentialRampToValueAtTime(200, t + this._stepDur * 0.7);
    f.Q.value = 5;
    o.connect(f); f.connect(g); g.connect(c.destination);
    const dur = this._stepDur * 0.85;
    g.gain.setValueAtTime(0.45, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.start(t); o.stop(t + dur);
  }

  _pad(t) {
    if (this.muted) return;
    const c = this.ctx;
    [110, 164.8, 220].forEach(freq => {
      const o = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain();
      o.type = "triangle"; o.frequency.value = freq;
      f.type = "lowpass"; f.frequency.value = 1200; f.Q.value = 1;
      o.connect(f); f.connect(g); g.connect(c.destination);
      const dur = this._stepDur * 4;
      g.gain.setValueAtTime(0.035, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.start(t); o.stop(t + dur);
    });
  }
}

const audioEngine = new LoFiEngine();

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

function gameTick(state, nextDir, wallMode = "finite") {
  if (state.gameOver) return state;
  const dir = nextDir || state.direction;
  const [dx, dy] = DIR_VECTORS[dir];
  const [hx, hy] = state.snake[0];
  let nx = hx + dx;
  let ny = hy + dy;

  if (wallMode === "finite") {
    if (nx < 0 || nx >= GRID || ny < 0 || ny >= GRID) {
      return { ...state, gameOver: true, direction: dir };
    }
  } else {
    nx = (nx + GRID) % GRID;
    ny = (ny + GRID) % GRID;
  }

  // Self collision
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
function GameBoard({ state, cellSize, wallMode }) {
  const canvasRef = useRef(null);
  const animRef = useRef(null);
  const stateRef = useRef(state);
  const wallModeRef2 = useRef(wallMode);
  const cellSizeRef = useRef(cellSize);
  const gridCanvasRef = useRef(null);

  // Keep refs in sync every render (no re-subscription needed)
  stateRef.current = state;
  wallModeRef2.current = wallMode;
  cellSizeRef.current = cellSize;

  // Rebuild canvas size + cached offscreen grid when cellSize changes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const size = GRID * cellSize;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = size + "px";
    canvas.style.height = size + "px";

    // Pre-render static grid to offscreen canvas
    const gc = document.createElement("canvas");
    gc.width = size * dpr;
    gc.height = size * dpr;
    const gctx = gc.getContext("2d");
    gctx.scale(dpr, dpr);
    gctx.fillStyle = "#0a0a0f";
    gctx.fillRect(0, 0, size, size);
    gctx.strokeStyle = "rgba(255,255,255,0.03)";
    gctx.lineWidth = 0.5;
    for (let i = 0; i <= GRID; i++) {
      gctx.beginPath(); gctx.moveTo(i * cellSize, 0); gctx.lineTo(i * cellSize, size); gctx.stroke();
      gctx.beginPath(); gctx.moveTo(0, i * cellSize); gctx.lineTo(size, i * cellSize); gctx.stroke();
    }
    gridCanvasRef.current = gc;
  }, [cellSize]);

  // Continuous RAF loop — runs once, reads state from refs to avoid restart jank
  useEffect(() => {
    let running = true;

    function draw() {
      if (!running) return;
      const canvas = canvasRef.current;
      const gridCanvas = gridCanvasRef.current;
      if (!canvas || !gridCanvas) {
        animRef.current = requestAnimationFrame(draw);
        return;
      }

      const dpr = window.devicePixelRatio || 1;
      const cs = cellSizeRef.current;
      const size = GRID * cs;
      const ctx = canvas.getContext("2d");
      const { snake, food, gameOver, score } = stateRef.current;
      const wm = wallModeRef2.current;

      // Composite cached background + grid (one fast blit)
      ctx.drawImage(gridCanvas, 0, 0);

      // All logical drawing in CSS-pixel space
      ctx.save();
      ctx.scale(dpr, dpr);

      // Wall border
      if (wm === "finite") {
        ctx.shadowColor = "#4ECDC4";
        ctx.shadowBlur = 8;
        ctx.strokeStyle = "rgba(78,205,196,0.55)";
        ctx.lineWidth = 2;
        ctx.setLineDash([]);
      } else {
        ctx.shadowBlur = 0;
        ctx.strokeStyle = "rgba(78,205,196,0.18)";
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 6]);
      }
      ctx.strokeRect(1, 1, size - 2, size - 2);
      ctx.shadowBlur = 0;
      ctx.setLineDash([]);

      // Food with animated glow
      const t = Date.now() / 400;
      const glow = 8 + Math.sin(t) * 4;
      ctx.shadowColor = "#ff6b6b";
      ctx.shadowBlur = glow;
      ctx.fillStyle = "#ff6b6b";
      ctx.beginPath();
      ctx.arc(food[0] * cs + cs / 2, food[1] * cs + cs / 2, cs * 0.35, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Snake segments
      snake.forEach(([x, y], i) => {
        const ratio = i / Math.max(snake.length - 1, 1);
        const r = Math.round(78 + (30 - 78) * ratio);
        const g = Math.round(205 + (200 - 205) * ratio);
        const b = Math.round(196 + (255 - 196) * ratio);
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        const pad = i === 0 ? 0.5 : 1;
        const radius = i === 0 ? cs * 0.15 : cs * 0.1;
        const rx = x * cs + pad;
        const ry = y * cs + pad;
        const rw = cs - pad * 2;
        const rh = cs - pad * 2;
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

      // Game-over overlay
      if (gameOver) {
        ctx.fillStyle = "rgba(0,0,0,0.7)";
        ctx.fillRect(0, 0, size, size);
        ctx.fillStyle = "#E85D75";
        ctx.font = `bold ${cs * 1.5}px 'JetBrains Mono', monospace`;
        ctx.textAlign = "center";
        ctx.fillText("GAME OVER", size / 2, size / 2 - cs);
        ctx.fillStyle = "#ccc";
        ctx.font = `${cs * 0.7}px 'JetBrains Mono', monospace`;
        ctx.fillText(`Score: ${score}`, size / 2, size / 2 + cs * 0.5);
      }

      ctx.restore();
      animRef.current = requestAnimationFrame(draw);
    }

    animRef.current = requestAnimationFrame(draw);
    return () => {
      running = false;
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, []); // Empty deps — loop runs once and reads state via refs

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
function LobbyScreen({ onSingle, onHost, onJoin }) {
  const [code, setCode] = useState("");
  const [mode, setMode] = useState("multi");    // "single" | "multi"
  const [walls, setWalls] = useState("finite"); // "finite" | "infinite"

  const toggleBase = {
    flex: 1, padding: "10px 8px", borderRadius: 8, border: "none",
    fontSize: 13, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace",
    cursor: "pointer", transition: "all 0.15s",
  };
  const active = (color) => ({ ...toggleBase, background: color, color: "#0a0a0f" });
  const inactive = { ...toggleBase, background: "transparent", color: "rgba(255,255,255,0.35)" };
  const toggleWrap = {
    display: "flex", background: "rgba(255,255,255,0.05)", borderRadius: 10, padding: 3,
  };

  return (
    <div style={styles.screenCenter}>
      <div style={{ textAlign: "center" }}>
        <h1 style={styles.title}>SNAKE × 4</h1>
        <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, marginTop: 8 }}>
          {mode === "single" ? "Solo. D-pad. Go." : "4 players. 1 snake. 1 button each."}
        </p>
      </div>

      {/* Game mode */}
      <div style={{ width: "100%", maxWidth: 300 }}>
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", letterSpacing: 2, marginBottom: 8 }}>MODE</div>
        <div style={toggleWrap}>
          <button onClick={() => setMode("single")} style={mode === "single" ? active("#4ECDC4") : inactive}>Single Player</button>
          <button onClick={() => setMode("multi")} style={mode === "multi" ? active("#4ECDC4") : inactive}>Multiplayer</button>
        </div>
      </div>

      {/* Wall config — only creator sets this */}
      <div style={{ width: "100%", maxWidth: 300 }}>
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", letterSpacing: 2, marginBottom: 8 }}>WALLS</div>
        <div style={toggleWrap}>
          <button onClick={() => setWalls("finite")} style={walls === "finite" ? active("#E85D75") : inactive}>Finite</button>
          <button onClick={() => setWalls("infinite")} style={walls === "infinite" ? active("#7B68EE") : inactive}>Infinite</button>
        </div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", marginTop: 6, textAlign: "center" }}>
          {walls === "finite" ? "Hitting a wall ends the game" : "Snake wraps to the opposite side"}
        </div>
      </div>

      {mode === "single" ? (
        <button onClick={() => onSingle(walls)} style={styles.btnPrimary}>Play</button>
      ) : (
        <>
          <button onClick={() => onHost(walls)} style={styles.btnPrimary}>Create Room</button>
          <div style={styles.divider}>
            <div style={styles.dividerLine} />
            <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 12 }}>OR JOIN</span>
            <div style={styles.dividerLine} />
          </div>
          <div style={{ display: "flex", gap: 8, width: "100%", maxWidth: 300 }}>
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
                background: code.length >= 4 ? "#7B68EE" : "rgba(255,255,255,0.05)",
                color: code.length >= 4 ? "#fff" : "rgba(255,255,255,0.2)",
                cursor: code.length >= 4 ? "pointer" : "default",
              }}
            >Join</button>
          </div>
        </>
      )}
    </div>
  );
}

// ── WAITING ROOM ────────────────────────────────────────────────────
function WaitingRoom({ roomCode, players, mySlot, isHost, wallMode, onStart, onBack }) {
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

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>
          Share this code with 3 friends
        </div>
        <div style={{
          fontSize: 10, fontWeight: 700, letterSpacing: 1,
          padding: "3px 8px", borderRadius: 6,
          background: wallMode === "finite" ? "rgba(232,93,117,0.15)" : "rgba(123,104,238,0.15)",
          color: wallMode === "finite" ? "#E85D75" : "#7B68EE",
          border: `1px solid ${wallMode === "finite" ? "rgba(232,93,117,0.3)" : "rgba(123,104,238,0.3)"}`,
        }}>
          {wallMode === "finite" ? "FINITE" : "INFINITE"}
        </div>
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
                {taken ? (isMe ? "You" : (i === 0 ? "Host" : "Joined")) : "Waiting..."}
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

      <button
        onClick={onBack}
        style={styles.btnSecondary}
      >
        Back
      </button>
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

  const [muted, setMuted] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState("ok");
  const [wallMode, setWallMode] = useState("finite");
  const [isSinglePlayer, setIsSinglePlayer] = useState(false);
  const isSinglePlayerRef = useRef(false);
  const [highScore, setHighScore] = useState(
    () => parseInt(localStorage.getItem("snake4p_hs") || "0", 10)
  );

  const channelRef = useRef(null);
  const gameRef = useRef(initGame());
  const dirQueueRef = useRef([]);   // queues direction inputs (max 3); replaces single-slot nextDirRef
  const playersRef = useRef([null, null, null, null]);
  const myIdRef = useRef(Math.random().toString(36).slice(2, 8));
  const tickRef = useRef(null);
  const isHostRef = useRef(false);
  const retryRef = useRef(null);
  const mySlotRef = useRef(-1);
  const speedRef = useRef(TICK_MS);
  const wallModeRef = useRef("finite");

  // Responsive cell size + scroll/touchmove lock
  const [cellSize, setCellSize] = useState(16);
  useEffect(() => {
    function resize() {
      const maxW = Math.min(window.innerWidth - 20, 540);
      const maxH = window.innerHeight * 0.55;
      setCellSize(Math.floor(Math.min(maxW, maxH) / GRID));
    }
    resize();
    window.addEventListener("resize", resize);
    const noScroll = (e) => e.preventDefault();
    document.addEventListener("touchmove", noScroll, { passive: false });
    return () => {
      window.removeEventListener("resize", resize);
      document.removeEventListener("touchmove", noScroll);
    };
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
      worker: true,  // Run heartbeat in Web Worker — reduces iOS background throttling
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
      if (!DIRECTIONS.includes(dir)) return; // guard against malformed/serialized payloads
      const cur = gameRef.current.direction;
      if (OPPOSITES[dir] !== cur) {
        if (dirQueueRef.current.length < 3) dirQueueRef.current.push(dir);
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

    // ── Listen: state resync request (host responds) ──
    channel.on("broadcast", { event: "request_game_state" }, () => {
      if (!isHostRef.current) return;
      channel.send({
        type: "broadcast",
        event: "game_state",
        payload: { state: gameRef.current },
      });
    });

    // ── Listen: game start ──
    channel.on("broadcast", { event: "game_start" }, ({ payload }) => {
      const wm = payload?.wallMode || "finite";
      wallModeRef.current = wm;
      setWallMode(wm);
      const fresh = initGame();
      gameRef.current = fresh;
      dirQueueRef.current = [];
      setGameState(fresh);
      setScreen("game");
      audioEngine.start();
    });

    // ── Listen: restart ──
    channel.on("broadcast", { event: "game_restart" }, ({ payload }) => {
      const wm = payload?.wallMode || wallModeRef.current;
      wallModeRef.current = wm;
      setWallMode(wm);
      const fresh = initGame();
      gameRef.current = fresh;
      dirQueueRef.current = [];
      setGameState(fresh);
      audioEngine.start();
    });

    return channel;
  }

  // ── Single player ──
  function handleSinglePlayer(walls) {
    audioEngine.init();
    wallModeRef.current = walls;
    setWallMode(walls);
    isHostRef.current = true;
    setIsHost(true);
    isSinglePlayerRef.current = true;
    setIsSinglePlayer(true);
    setMySlot(0);
    mySlotRef.current = 0;
    const plist = [myIdRef.current, null, null, null];
    playersRef.current = plist;
    setPlayers([...plist]);
    speedRef.current = TICK_MS;
    const fresh = initGame();
    gameRef.current = fresh;
    dirQueueRef.current = [];
    setGameState(fresh);
    audioEngine.start();
    setScreen("game");
  }

  // ── Host a room ──
  function handleHost(walls) {
    audioEngine.init();
    wallModeRef.current = walls;
    setWallMode(walls);
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
    ch.subscribe((status) => {
      console.log("[snake] host channel status:", status);
      if (status === "SUBSCRIBED") setConnectionStatus("ok");
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        setConnectionStatus("reconnecting");
        setTimeout(() => channelRef.current?.subscribe(), 2000);
      }
    });

    console.log("[snake] hosting room", code, "myId:", myIdRef.current);
  }

  // ── Join a room ──
  function handleJoin(code) {
    audioEngine.init();
    setRoomCode(code);
    setIsHost(false);
    isHostRef.current = false;
    setScreen("waiting");

    const ch = joinChannel(code);
    channelRef.current = ch;

    // Once subscribed, request a slot. Retry every 2s until acknowledged.
    ch.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        setConnectionStatus("ok");
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
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        setConnectionStatus("reconnecting");
        setTimeout(() => channelRef.current?.subscribe(), 2000);
      }
    });
  }

  // ── Start game (host) ──
  function handleStart() {
    const fresh = initGame();
    gameRef.current = fresh;
    dirQueueRef.current = [];
    speedRef.current = TICK_MS;
    setGameState(fresh);
    setScreen("game");
    audioEngine.start();
    channelRef.current?.send({
      type: "broadcast",
      event: "game_start",
      payload: { wallMode: wallModeRef.current },
    });
  }

  // ── Shared tick starter (extracted to eliminate duplication + add drift correction) ──
  function startTick() {
    if (tickRef.current) clearTimeout(tickRef.current);
    const wm = wallModeRef.current;

    const tick = () => {
      const tickStart = Date.now();
      const prevScore = gameRef.current.score;
      const queued = dirQueueRef.current.length > 0 ? dirQueueRef.current.shift() : null;
      const dir = queued || gameRef.current.direction;
      const newState = gameTick(gameRef.current, dir, wm);
      gameRef.current = newState;
      setGameState({ ...newState });
      channelRef.current?.send({ type: "broadcast", event: "game_state", payload: { state: newState } });
      if (newState.gameOver) { audioEngine.stop(); return; }
      if (newState.score > prevScore) {
        speedRef.current = Math.max(80, TICK_MS - Math.max(0, newState.score - 2) * 8);
      }
      // Drift correction: subtract actual execution time from next delay
      const elapsed = Date.now() - tickStart;
      tickRef.current = setTimeout(tick, Math.max(0, speedRef.current - elapsed));
    };

    tickRef.current = setTimeout(tick, speedRef.current);
  }

  // ── Host game loop ──
  useEffect(() => {
    if (screen !== "game" || !isHost) return;
    startTick();
    return () => clearTimeout(tickRef.current);
  }, [screen, isHost]);

  // ── Press my button ──
  function handlePress(explicitDir) {
    const slot = mySlotRef.current;
    if (slot < 0 || gameState.gameOver) return;
    const dir = explicitDir != null ? explicitDir : DIRECTIONS[slot];

    setFlashDir(dir);
    setTimeout(() => setFlashDir(null), 120);

    if (isHostRef.current) {
      const cur = gameRef.current.direction;
      if (OPPOSITES[dir] !== cur) {
        if (dirQueueRef.current.length < 3) dirQueueRef.current.push(dir);
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
    dirQueueRef.current = [];
    speedRef.current = TICK_MS;
    setGameState(fresh);
    audioEngine.start();
    channelRef.current?.send({
      type: "broadcast",
      event: "game_restart",
      payload: { wallMode: wallModeRef.current },
    });
    startTick();
  }

  // ── Keyboard ──
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
      // Single player: all 4 arrow keys work. Multiplayer: only the assigned direction.
      if (isSinglePlayerRef.current || DIRECTIONS[mySlotRef.current] === dir) {
        handlePress(dir);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [gameState.gameOver]);

  // ── Persist high score ──
  useEffect(() => {
    if (gameState.gameOver && gameState.score > 0) {
      setHighScore((prev) => {
        const next = Math.max(prev, gameState.score);
        localStorage.setItem("snake4p_hs", String(next));
        return next;
      });
    }
  }, [gameState.gameOver, gameState.score]);

  // ── Go home (back / quit) ──
  function handleGoHome() {
    audioEngine.stop();
    if (tickRef.current) clearTimeout(tickRef.current);
    if (retryRef.current) clearInterval(retryRef.current);
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    // Reset all session state
    setScreen("lobby");
    setRoomCode("");
    setMySlot(-1);
    mySlotRef.current = -1;
    setIsHost(false);
    isHostRef.current = false;
    setIsSinglePlayer(false);
    isSinglePlayerRef.current = false;
    setPlayers([null, null, null, null]);
    playersRef.current = [null, null, null, null];
    dirQueueRef.current = [];
    speedRef.current = TICK_MS;
    const fresh = initGame();
    gameRef.current = fresh;
    setGameState(fresh);
  }

  // ── Cleanup ──
  useEffect(() => {
    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current);
      if (retryRef.current) clearInterval(retryRef.current);
      if (tickRef.current) clearTimeout(tickRef.current);
      audioEngine.stop();
    };
  }, []);

  // ── AudioContext resume on tab return ──
  useEffect(() => {
    const onVisible = () => {
      if (!document.hidden && audioEngine.ctx?.state === "suspended") {
        audioEngine.ctx.resume();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  // ── Host: pause tick on hide, resume on show ──
  useEffect(() => {
    if (screen !== "game" || !isHost) return;
    const onHide = () => {
      if (document.hidden) {
        clearTimeout(tickRef.current);
        tickRef.current = null;
      } else {
        if (!gameRef.current.gameOver && tickRef.current === null) startTick();
      }
    };
    const onPageHide = () => { clearTimeout(tickRef.current); tickRef.current = null; };
    const onPageShow = () => {
      if (!gameRef.current.gameOver && tickRef.current === null) startTick();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [screen, isHost]);

  // ── Non-host: resubscribe channel on tab return ──
  useEffect(() => {
    if (screen !== "game" || isHost) return;
    const onVisible = () => {
      if (!document.hidden && channelRef.current) {
        const s = channelRef.current.state;
        if (s === "closed" || s === "errored") channelRef.current.subscribe();
        // Request fresh game state immediately on return
        channelRef.current.send({
          type: "broadcast",
          event: "request_game_state",
          payload: {},
        });
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [screen, isHost]);

  // ═════════════════════════════════════════════════════════════════
  // RENDER
  // ═════════════════════════════════════════════════════════════════

  if (screen === "lobby") {
    return <LobbyScreen onSingle={handleSinglePlayer} onHost={handleHost} onJoin={handleJoin} />;
  }

  if (screen === "waiting") {
    return (
      <WaitingRoom
        roomCode={roomCode}
        players={players}
        mySlot={mySlot}
        isHost={isHost}
        wallMode={wallMode}
        onStart={handleStart}
        onBack={handleGoHome}
      />
    );
  }

  function toggleMute() {
    const next = !muted;
    setMuted(next);
    audioEngine.setMuted(next);
  }

  const myDir = mySlot >= 0 ? DIRECTIONS[mySlot] : null;
  const myColor = mySlot >= 0 ? DIR_COLORS[mySlot] : "#888";

  return (
    <div style={styles.gameScreen}>
      {connectionStatus === "reconnecting" && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0,
          background: "#c0392b", color: "#fff",
          fontSize: 12, textAlign: "center", padding: "5px 0", zIndex: 999,
          fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1,
        }}>
          RECONNECTING...
        </div>
      )}
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
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#4ECDC4" }}>
            {gameState.score}
          </div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", letterSpacing: 1 }}>
            BEST {highScore}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
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
          <button
            onClick={toggleMute}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 4,
              color: muted ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.5)",
              lineHeight: 0,
            }}
          >
            {muted ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                <line x1="23" y1="9" x2="17" y2="15"/>
                <line x1="17" y1="9" x2="23" y2="15"/>
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
              </svg>
            )}
          </button>
        </div>
      </div>

      <GameBoard state={gameState} cellSize={cellSize} wallMode={wallMode} />

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
          {isSinglePlayer ? "Controls" : "Your control"}
        </div>

        {isSinglePlayer ? (
          /* D-pad for single player */
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
            {/* Row 1: empty, UP, empty */}
            <div />
            <button
              onPointerDown={() => handlePress("UP")}
              style={{
                height: 64, borderRadius: 12,
                border: `2px solid ${flashDir === "UP" ? myColor : "rgba(255,255,255,0.15)"}`,
                background: flashDir === "UP" ? `${myColor}33` : "rgba(255,255,255,0.03)",
                color: flashDir === "UP" ? myColor : "rgba(255,255,255,0.6)",
                cursor: "pointer", transition: "background 0.08s, border-color 0.08s",
                display: "flex", alignItems: "center", justifyContent: "center",
                userSelect: "none", WebkitTapHighlightColor: "transparent", outline: "none",
              }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="18 15 12 9 6 15"/>
              </svg>
            </button>
            <div />
            {/* Row 2: LEFT, DOWN, RIGHT */}
            <button
              onPointerDown={() => handlePress("LEFT")}
              style={{
                height: 64, borderRadius: 12,
                border: `2px solid ${flashDir === "LEFT" ? myColor : "rgba(255,255,255,0.15)"}`,
                background: flashDir === "LEFT" ? `${myColor}33` : "rgba(255,255,255,0.03)",
                color: flashDir === "LEFT" ? myColor : "rgba(255,255,255,0.6)",
                cursor: "pointer", transition: "background 0.08s, border-color 0.08s",
                display: "flex", alignItems: "center", justifyContent: "center",
                userSelect: "none", WebkitTapHighlightColor: "transparent", outline: "none",
              }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6"/>
              </svg>
            </button>
            <button
              onPointerDown={() => handlePress("DOWN")}
              style={{
                height: 64, borderRadius: 12,
                border: `2px solid ${flashDir === "DOWN" ? myColor : "rgba(255,255,255,0.15)"}`,
                background: flashDir === "DOWN" ? `${myColor}33` : "rgba(255,255,255,0.03)",
                color: flashDir === "DOWN" ? myColor : "rgba(255,255,255,0.6)",
                cursor: "pointer", transition: "background 0.08s, border-color 0.08s",
                display: "flex", alignItems: "center", justifyContent: "center",
                userSelect: "none", WebkitTapHighlightColor: "transparent", outline: "none",
              }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </button>
            <button
              onPointerDown={() => handlePress("RIGHT")}
              style={{
                height: 64, borderRadius: 12,
                border: `2px solid ${flashDir === "RIGHT" ? myColor : "rgba(255,255,255,0.15)"}`,
                background: flashDir === "RIGHT" ? `${myColor}33` : "rgba(255,255,255,0.03)",
                color: flashDir === "RIGHT" ? myColor : "rgba(255,255,255,0.6)",
                cursor: "pointer", transition: "background 0.08s, border-color 0.08s",
                display: "flex", alignItems: "center", justifyContent: "center",
                userSelect: "none", WebkitTapHighlightColor: "transparent", outline: "none",
              }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </button>
          </div>
        ) : (
          /* Single directional button for multiplayer */
          <button
            onPointerDown={() => handlePress()}
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
        )}
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
      {gameState.gameOver && (
        <button
          onClick={handleGoHome}
          style={{ ...styles.btnSecondary, marginTop: 4 }}
        >
          Quit
        </button>
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
  btnSecondary: {
    width: "100%",
    maxWidth: 300,
    padding: "12px 24px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "transparent",
    color: "rgba(255,255,255,0.4)",
    fontSize: 14,
    fontWeight: 600,
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

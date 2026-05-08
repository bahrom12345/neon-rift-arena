import http from "node:http";
import { WebSocketServer } from "ws";

const PORT = Number(process.env.PORT || 8080);
const TICK_RATE = 30;
const MAX_PLAYERS = 10;
const STALE_MS = 7000;

const players = new Map();

const server = http.createServer((request, response) => {
  if (request.url === "/health") {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ ok: true, players: players.size }));
    return;
  }

  response.writeHead(200, { "Content-Type": "text/plain" });
  response.end("Neon Rift realtime server is running.");
});

const wss = new WebSocketServer({ server });

wss.on("connection", socket => {
  socket.on("message", message => {
    let data;
    try {
      data = JSON.parse(message);
    } catch {
      return;
    }

    if (data.type === "ping") {
      socket.send(JSON.stringify({ type: "pong", clientTime: data.clientTime || Date.now() }));
      return;
    }

    if (data.type !== "join" && data.type !== "state") return;
    const player = sanitizePlayer(data.player);
    if (!player) return;

    if (!players.has(player.id) && players.size >= MAX_PLAYERS) {
      socket.send(JSON.stringify({ type: "full" }));
      socket.close();
      return;
    }

    socket.playerId = player.id;
    players.set(player.id, {
      ...player,
      updatedAt: Date.now()
    });
  });

  socket.on("close", () => {
    if (socket.playerId) players.delete(socket.playerId);
  });
});

setInterval(() => {
  const now = Date.now();
  for (const [id, player] of players) {
    if (now - player.updatedAt > STALE_MS) players.delete(id);
  }

  const packet = JSON.stringify({
    type: "players",
    players: [...players.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_PLAYERS)
  });

  for (const client of wss.clients) {
    if (client.readyState === client.OPEN) client.send(packet);
  }
}, 1000 / TICK_RATE);

server.listen(PORT, () => {
  console.log(`Neon Rift realtime server listening on ${PORT}`);
});

function sanitizePlayer(input) {
  if (!input || typeof input !== "object") return null;

  const id = String(input.id || "")
    .replace(/[^\w.-]/g, "")
    .slice(0, 80);
  if (!id) return null;

  return {
    id,
    name: String(input.name || "Pilot").replace(/[^\w .-]/g, "").trim().slice(0, 14) || "Pilot",
    color: /^#[0-9a-f]{6}$/i.test(String(input.color || "")) ? String(input.color) : "#31d7ff",
    x: clamp(input.x, 0, 5600),
    y: clamp(input.y, 0, 5600),
    vx: clamp(input.vx, -1800, 1800),
    vy: clamp(input.vy, -1800, 1800),
    angle: clamp(input.angle, -7, 7),
    health: clamp(input.health, 0, 200),
    score: clamp(input.score, 0, 999999999),
    level: clamp(input.level, 1, 999),
    dead: Boolean(input.dead),
    shots: sanitizeShots(input.shots)
  };
}

function sanitizeShots(shots) {
  if (!Array.isArray(shots)) return [];
  const now = Date.now();

  return shots.slice(-14).map(shot => ({
    id: String(shot.id || "").replace(/[^\w.-]/g, "").slice(0, 120),
    owner: String(shot.owner || "").replace(/[^\w.-]/g, "").slice(0, 80),
    ownerName: String(shot.ownerName || "Pilot").replace(/[^\w .-]/g, "").slice(0, 14),
    x: clamp(shot.x, 0, 5600),
    y: clamp(shot.y, 0, 5600),
    vx: clamp(shot.vx, -1800, 1800),
    vy: clamp(shot.vy, -1800, 1800),
    damage: clamp(shot.damage, 1, 80),
    createdAt: clamp(shot.createdAt, now - 2500, now + 500)
  })).filter(shot => shot.id && shot.owner);
}

function clamp(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, number));
}

import { getStore } from "@netlify/blobs";

const headers = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store"
};

const store = getStore({
  name: "neon-rift-arena",
  consistency: "strong"
});

export default async function handler(request) {
  if (request.method === "GET") {
    return json({ players: await getPlayers() });
  }

  if (request.method === "POST") {
    const body = await request.json().catch(() => null);
    const player = sanitizePlayer(body);

    if (!player) {
      return json({ error: "Invalid player state" }, 400);
    }

    await store.setJSON(`players/${player.id}`, {
      ...player,
      updatedAt: Date.now()
    });

    return json({ players: await getPlayers() });
  }

  return json({ error: "Method not allowed" }, 405);
}

async function getPlayers() {
  const listing = await store.list({ prefix: "players/" });
  const now = Date.now();
  const players = [];

  for (const blob of listing.blobs) {
    const player = await store.get(blob.key, { type: "json" }).catch(() => null);
    if (!player || now - Number(player.updatedAt || 0) > 10000) {
      await store.delete(blob.key).catch(() => {});
      continue;
    }

    const safePlayer = sanitizePlayer(player);
    if (safePlayer) {
      players.push({
        ...safePlayer,
        updatedAt: Number(player.updatedAt || now)
      });
    }
  }

  return players
    .sort((a, b) => Number(b.score || 0) - Number(a.score || 0))
    .slice(0, 40);
}

function sanitizePlayer(input) {
  if (!input || typeof input !== "object") return null;

  const id = String(input.id || "")
    .replace(/[^\w.-]/g, "")
    .slice(0, 80);
  if (!id) return null;

  const name = String(input.name || "Pilot")
    .replace(/[^\w .-]/g, "")
    .trim()
    .slice(0, 14) || "Pilot";

  const color = /^#[0-9a-f]{6}$/i.test(String(input.color || ""))
    ? String(input.color)
    : "#31d7ff";

  return {
    id,
    name,
    color,
    x: clampNumber(input.x, 0, 5600),
    y: clampNumber(input.y, 0, 5600),
    vx: clampNumber(input.vx, -1600, 1600),
    vy: clampNumber(input.vy, -1600, 1600),
    angle: clampNumber(input.angle, -7, 7),
    health: clampNumber(input.health, 0, 200),
    score: clampNumber(input.score, 0, 999999999),
    level: clampNumber(input.level, 1, 999),
    dead: Boolean(input.dead),
    shots: sanitizeShots(input.shots)
  };
}

function sanitizeShots(shots) {
  if (!Array.isArray(shots)) return [];
  return shots.slice(-18).map(shot => ({
    id: String(shot.id || "").replace(/[^\w.-]/g, "").slice(0, 120),
    owner: String(shot.owner || "").replace(/[^\w.-]/g, "").slice(0, 80),
    ownerName: String(shot.ownerName || "Pilot").replace(/[^\w .-]/g, "").slice(0, 14),
    x: clampNumber(shot.x, 0, 5600),
    y: clampNumber(shot.y, 0, 5600),
    vx: clampNumber(shot.vx, -1800, 1800),
    vy: clampNumber(shot.vy, -1800, 1800),
    damage: clampNumber(shot.damage, 1, 80),
    createdAt: clampNumber(shot.createdAt, Date.now() - 3000, Date.now() + 1000)
  })).filter(shot => shot.id && shot.owner);
}

function clampNumber(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, number));
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers
  });
}

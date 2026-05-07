import { getStore } from "@netlify/blobs";
import { randomUUID } from "node:crypto";

const headers = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store"
};

const store = getStore({
  name: "neon-rift-leaderboard",
  consistency: "strong"
});

export default async function handler(request) {
  if (request.method === "GET") {
    return json({ scores: await getTopScores() });
  }

  if (request.method === "POST") {
    const body = await request.json().catch(() => null);
    const entry = sanitizeEntry(body);

    if (!entry) {
      return json({ error: "Invalid score entry" }, 400);
    }

    await store.setJSON(`scores/${Date.now()}-${randomUUID()}`, entry);
    return json({ scores: await getTopScores() }, 201);
  }

  return json({ error: "Method not allowed" }, 405);
}

async function getTopScores() {
  const listing = await store.list({ prefix: "scores/" });
  const entries = [];

  for (const blob of listing.blobs) {
    const entry = await store.get(blob.key, { type: "json" }).catch(() => null);
    const safeEntry = sanitizeEntry(entry);
    if (safeEntry) entries.push(safeEntry);
  }

  return entries
    .sort((a, b) => b.score - a.score || b.wave - a.wave || b.level - a.level)
    .slice(0, 10);
}

function sanitizeEntry(entry) {
  if (!entry || typeof entry !== "object") return null;

  const name = String(entry.name || "Pilot")
    .replace(/[^\w .-]/g, "")
    .trim()
    .slice(0, 14) || "Pilot";

  const score = Math.floor(Number(entry.score));
  const wave = Math.floor(Number(entry.wave));
  const level = Math.floor(Number(entry.level));

  if (!Number.isFinite(score) || !Number.isFinite(wave) || !Number.isFinite(level)) {
    return null;
  }

  return {
    name,
    score: clamp(score, 0, 999999999),
    wave: clamp(wave, 1, 999),
    level: clamp(level, 1, 999),
    date: String(entry.date || new Date().toLocaleDateString()).slice(0, 24)
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers
  });
}

import { db } from './db.js';
import { uid } from './util.js';

export function searchGames(query) {
  const q = query.toLowerCase();
  return db.games.load().filter((g) =>
    g.title.toLowerCase().includes(q) ||
    (g.genres || []).some((gn) => gn.toLowerCase().includes(q)) ||
    (g.platforms || []).some((p) => p.toLowerCase().includes(q))
  );
}

export function getGame(id) {
  return db.games.load().find((g) => g.id === id) || null;
}

export function listGames(page = 0, limit = 10) {
  const all = db.games.load();
  const start = page * limit;
  return all.slice(start, start + limit);
}

export function totalGames() {
  return db.games.load().length;
}

export function addGame(raw) {
  const games = db.games.load();
  const game = {
    id: uid(),
    title: raw.title || 'Без названия',
    description: raw.description || '',
    genres: raw.genres || [],
    platforms: raw.platforms || [],
    links: raw.links || {},
    fileId: raw.fileId || null,
    fileName: raw.fileName || null,
    fileSize: raw.fileSize || null,
    coverUrl: raw.coverUrl || null,
    createdAt: Date.now(),
  };
  games.unshift(game);
  db.games.save(games);
  return game;
}

export function updateGame(id, patch) {
  const games = db.games.load();
  const idx = games.findIndex((g) => g.id === id);
  if (idx === -1) return null;
  games[idx] = { ...games[idx], ...patch };
  db.games.save(games);
  return games[idx];
}

export function removeGame(id) {
  const games = db.games.load().filter((g) => g.id !== id);
  db.games.save(games);
}

export function latestGames(limit = 5) {
  return db.games.load().slice(0, limit);
}
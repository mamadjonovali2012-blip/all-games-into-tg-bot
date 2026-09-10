import { store } from './db.js';
import { uid } from './util.js';

export async function searchGames(query) {
  const q = query.toLowerCase();
  const games = await store.listGames();
  return games.filter((g) =>
    (g.title || '').toLowerCase().includes(q) ||
    (g.genres || []).some((gn) => (gn || '').toLowerCase().includes(q)) ||
    (g.platforms || []).some((p) => (p || '').toLowerCase().includes(q))
  );
}

export async function getGame(id) {
  const g = await store.getGame(id);
  if (!g) return null;
  return normalize(g);
}

export async function listGames(page = 0, limit = 10) {
  const all = await store.listGames();
  const start = page * limit;
  return all.slice(start, start + limit).map(normalize);
}

export async function totalGames() {
  return (await store.listGames()).length;
}

export async function addGame(raw) {
  const game = {
    id: uid(),
    title: raw.title || 'Без названия',
    description: raw.description || '',
    genres: raw.genres || [],
    platforms: raw.platforms || [],
    links: raw.links || {},
    fileId: raw.fileId || null,
    fileName: raw.fileName || null,
    fileSize: raw.fileSize || 0,
    files: raw.files || [],
    coverUrl: raw.coverUrl || null,
    screenshots: raw.screenshots || [],
    requirements: raw.requirements || {},
    rating: raw.rating || 0,
    downloads: 0,
    createdAt: Date.now(),
  };
  await store.saveGame(game);
  return game;
}

export async function updateGame(id, patch) {
  const game = await store.getGame(id);
  if (!game) return null;
  const updated = { ...normalize(game), ...patch };
  await store.saveGame(updated);
  return updated;
}

export async function removeGame(id) {
  await store.deleteGame(id);
}

export async function latestGames(limit = 5) {
  return (await store.listGames()).slice(0, limit).map(normalize);
}

export async function topGames(limit = 10) {
  return store.topGames(limit).then((r) => r.map(normalize));
}

export async function incDownloads(id) {
  const game = await store.getGame(id);
  if (!game) return null;
  const updated = { ...normalize(game), downloads: (game.downloads || 0) + 1 };
  await store.saveGame(updated);
  return updated;
}

function normalize(g) {
  return {
    id: g.id,
    title: g.title,
    description: g.description || '',
    genres: g.genres || [],
    platforms: g.platforms || [],
    links: g.links || {},
    fileId: g.file_id || g.fileId || null,
    fileName: g.file_name || g.fileName || null,
    fileSize: g.file_size ?? g.fileSize ?? 0,
    files: g.files || [],
    coverUrl: g.cover_url || g.coverUrl || null,
    screenshots: g.screenshots || [],
    requirements: g.requirements || {},
    rating: g.rating || 0,
    downloads: g.downloads || 0,
    createdAt: g.created_at || g.createdAt || 0,
  };
}
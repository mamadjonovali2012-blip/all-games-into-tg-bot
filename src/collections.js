import { store } from './db.js';
import { uid } from './util.js';

export async function createCollection(raw) {
  const c = {
    id: uid(),
    title: raw.title || 'Подборка',
    description: raw.description || '',
    gameIds: raw.gameIds || [],
    createdAt: Date.now(),
  };
  await store.saveCollection(c);
  return c;
}

export async function listCollections() {
  return (await store.listCollections()).map(normalize);
}

export async function getCollection(id) {
  const c = await store.getCollection(id);
  return c ? normalize(c) : null;
}

export async function addGameToCollection(collectionId, gameId) {
  const c = await store.getCollection(collectionId);
  if (!c) return null;
  const updated = normalize(c);
  if (!updated.gameIds.includes(gameId)) updated.gameIds.push(gameId);
  await store.saveCollection(updated);
  return updated;
}

export async function removeGameFromCollection(collectionId, gameId) {
  const c = await store.getCollection(collectionId);
  if (!c) return null;
  const updated = normalize(c);
  updated.gameIds = updated.gameIds.filter((g) => g !== gameId);
  await store.saveCollection(updated);
  return updated;
}

export async function removeCollection(id) {
  await store.deleteCollection(id);
}

function normalize(c) {
  return {
    id: c.id,
    title: c.title,
    description: c.description || '',
    gameIds: c.game_ids || c.gameIds || [],
    createdAt: c.created_at || c.createdAt || 0,
  };
}
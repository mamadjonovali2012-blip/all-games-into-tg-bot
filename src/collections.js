import { db } from './db.js';
import { uid } from './util.js';

export function createCollection(raw) {
  const collections = db.collections.load();
  const c = {
    id: uid(),
    title: raw.title || 'Подборка',
    description: raw.description || '',
    gameIds: raw.gameIds || [],
    createdAt: Date.now(),
  };
  collections.unshift(c);
  db.collections.save(collections);
  return c;
}

export function listCollections() {
  return db.collections.load();
}

export function getCollection(id) {
  return db.collections.load().find((c) => c.id === id) || null;
}

export function addGameToCollection(collectionId, gameId) {
  const collections = db.collections.load();
  const c = collections.find((x) => x.id === collectionId);
  if (!c) return null;
  if (!c.gameIds.includes(gameId)) c.gameIds.push(gameId);
  db.collections.save(collections);
  return c;
}

export function removeGameFromCollection(collectionId, gameId) {
  const collections = db.collections.load();
  const c = collections.find((x) => x.id === collectionId);
  if (!c) return null;
  c.gameIds = c.gameIds.filter((g) => g !== gameId);
  db.collections.save(collections);
  return c;
}

export function removeCollection(id) {
  db.collections.save(db.collections.load().filter((c) => c.id !== id));
}
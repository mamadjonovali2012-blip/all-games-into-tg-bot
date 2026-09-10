import { store } from './db.js';

export async function addNews(raw) {
  const item = {
    id: Date.now().toString(),
    title: raw.title || 'Новость',
    text: raw.text || '',
    imageUrl: raw.imageUrl || null,
    createdAt: Date.now(),
  };
  await store.saveNews(item);
  return item;
}

export async function removeNews(id) {
  await store.deleteNews(id);
}

export async function listNews(limit = 10) {
  const all = await store.listNews();
  return all.slice(0, limit).map(normalize);
}

export async function getNews(id) {
  const n = await store.getNews(id);
  return n ? normalize(n) : null;
}

function normalize(n) {
  return {
    id: n.id,
    title: n.title,
    text: n.text || '',
    imageUrl: n.image_url || n.imageUrl || null,
    createdAt: n.created_at || n.createdAt || 0,
  };
}
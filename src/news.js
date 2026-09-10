import { db } from './db.js';

export function addNews(raw) {
  const news = db.news.load();
  const item = {
    id: Date.now().toString(),
    title: raw.title || 'Новость',
    text: raw.text || '',
    imageUrl: raw.imageUrl || null,
    createdAt: Date.now(),
  };
  news.unshift(item);
  db.news.save(news);
  return item;
}

export function removeNews(id) {
  db.news.save(db.news.load().filter((n) => n.id !== id));
}

export function listNews(limit = 10) {
  return db.news.load().slice(0, limit);
}

export function getNews(id) {
  return db.news.load().find((n) => n.id === id) || null;
}
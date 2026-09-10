// ============================================================
//  УНИВЕРСАЛЬНОЕ ХРАНИЛИЩЕ: PostgreSQL (при наличии DATABASE_URL)
//  или JSON-файлы (локально, без БД). Один интерфейс для всего кода.
// ============================================================
import pg from 'pg';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------- Режим 1: PostgreSQL ----------
const DATABASE_URL = process.env.DATABASE_URL;

let pool = null;
let usingPg = false;

async function ensureTables(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS games (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      genres TEXT[] DEFAULT '{}',
      platforms TEXT[] DEFAULT '{}',
      links JSONB DEFAULT '{}',
      file_id TEXT,
      file_name TEXT,
      file_size BIGINT,
      files JSONB DEFAULT '[]',
      cover_url TEXT,
      screenshots TEXT[] DEFAULT '{}',
      requirements JSONB DEFAULT '{}',
      rating NUMERIC DEFAULT 0,
      downloads INTEGER DEFAULT 0,
      created_at BIGINT
    );
    CREATE TABLE IF NOT EXISTS news (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      text TEXT DEFAULT '',
      image_url TEXT,
      created_at BIGINT
    );
    CREATE TABLE IF NOT EXISTS collections (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      game_ids TEXT[] DEFAULT '{}',
      created_at BIGINT
    );
    CREATE TABLE IF NOT EXISTS users (
      id BIGINT PRIMARY KEY,
      name TEXT DEFAULT '',
      username TEXT DEFAULT '',
      joined_at BIGINT
    );
    CREATE TABLE IF NOT EXISTS favorites (
      user_id BIGINT,
      game_id TEXT,
      created_at BIGINT,
      PRIMARY KEY (user_id, game_id)
    );
    CREATE TABLE IF NOT EXISTS history (
      id SERIAL PRIMARY KEY,
      user_id BIGINT,
      game_id TEXT,
      action TEXT,
      created_at BIGINT
    );
  `);
}

if (DATABASE_URL) {
  pool = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  usingPg = true;
  ensureTables(pool).then(() => console.log('🗄 PostgreSQL подключён, таблицы готовы'))
    .catch((e) => { console.error('PostgreSQL init error:', e.message); usingPg = false; });
}

// ---------- Режим 2: JSON-файлы ----------
const DATA_DIR = process.env.DATA_DIR || join(__dirname, '..', 'data');
if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

function loadJson(name) {
  const p = join(DATA_DIR, `${name}.json`);
  if (!existsSync(p)) return [];
  try { return JSON.parse(readFileSync(p, 'utf-8')); } catch { return []; }
}
function saveJson(name, data) {
  writeFileSync(join(DATA_DIR, `${name}.json`), JSON.stringify(data, null, 2), 'utf-8');
}

async function rows(q, params = []) {
  if (usingPg) return (await pool.query(q, params)).rows;
  return null;
}

// Универсальный API хранилища — все модули используют его
export const store = {
  usingPg: () => usingPg,

  // ---- games ----
  async listGames() {
    if (usingPg) return rows('SELECT * FROM games ORDER BY created_at DESC');
    return loadJson('games');
  },
  async getGame(id) {
    if (usingPg) return (await rows('SELECT * FROM games WHERE id=$1', [id]))[0] || null;
    return loadJson('games').find((g) => g.id === id) || null;
  },
  async saveGame(game) {
    if (usingPg) {
      await pool.query(`INSERT INTO games (id,title,description,genres,platforms,links,file_id,file_name,file_size,files,cover_url,screenshots,requirements,rating,downloads,created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
        ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title,description=EXCLUDED.description,genres=EXCLUDED.genres,platforms=EXCLUDED.platforms,links=EXCLUDED.links,file_id=EXCLUDED.file_id,file_name=EXCLUDED.file_name,file_size=EXCLUDED.file_size,files=EXCLUDED.files,cover_url=EXCLUDED.cover_url,screenshots=EXCLUDED.screenshots,requirements=EXCLUDED.requirements,rating=EXCLUDED.rating,downloads=EXCLUDED.downloads,created_at=EXCLUDED.created_at`,
        [game.id, game.title, game.description || '', game.genres || [], game.platforms || [], JSON.stringify(game.links || {}), game.fileId || null, game.fileName || null, game.fileSize || 0, JSON.stringify(game.files || []), game.coverUrl || null, game.screenshots || [], JSON.stringify(game.requirements || {}), game.rating || 0, game.downloads || 0, game.createdAt || Date.now()]);
      return;
    }
    const games = loadJson('games');
    const idx = games.findIndex((g) => g.id === game.id);
    if (idx >= 0) games[idx] = game; else games.unshift(game);
    saveJson('games', games);
  },
  async deleteGame(id) {
    if (usingPg) { await pool.query('DELETE FROM games WHERE id=$1', [id]); return; }
    saveJson('games', loadJson('games').filter((g) => g.id !== id));
  },

  // ---- news ----
  async listNews() {
    if (usingPg) return rows('SELECT * FROM news ORDER BY created_at DESC');
    return loadJson('news');
  },
  async getNews(id) {
    if (usingPg) return (await rows('SELECT * FROM news WHERE id=$1', [id]))[0] || null;
    return loadJson('news').find((n) => n.id === id) || null;
  },
  async saveNews(item) {
    if (usingPg) {
      await pool.query(`INSERT INTO news (id,title,text,image_url,created_at) VALUES ($1,$2,$3,$4,$5)
        ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title,text=EXCLUDED.text,image_url=EXCLUDED.image_url,created_at=EXCLUDED.created_at`,
        [item.id, item.title, item.text || '', item.imageUrl || null, item.createdAt || Date.now()]);
      return;
    }
    const news = loadJson('news');
    const idx = news.findIndex((n) => n.id === item.id);
    if (idx >= 0) news[idx] = item; else news.unshift(item);
    saveJson('news', news);
  },
  async deleteNews(id) {
    if (usingPg) { await pool.query('DELETE FROM news WHERE id=$1', [id]); return; }
    saveJson('news', loadJson('news').filter((n) => n.id !== id));
  },

  // ---- collections ----
  async listCollections() {
    if (usingPg) return rows('SELECT * FROM collections ORDER BY created_at DESC');
    return loadJson('collections');
  },
  async getCollection(id) {
    if (usingPg) return (await rows('SELECT * FROM collections WHERE id=$1', [id]))[0] || null;
    return loadJson('collections').find((c) => c.id === id) || null;
  },
  async saveCollection(c) {
    if (usingPg) {
      await pool.query(`INSERT INTO collections (id,title,description,game_ids,created_at) VALUES ($1,$2,$3,$4,$5)
        ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title,description=EXCLUDED.description,game_ids=EXCLUDED.game_ids,created_at=EXCLUDED.created_at`,
        [c.id, c.title, c.description || '', c.gameIds || [], c.createdAt || Date.now()]);
      return;
    }
    const cols = loadJson('collections');
    const idx = cols.findIndex((x) => x.id === c.id);
    if (idx >= 0) cols[idx] = c; else cols.unshift(c);
    saveJson('collections', cols);
  },
  async deleteCollection(id) {
    if (usingPg) { await pool.query('DELETE FROM collections WHERE id=$1', [id]); return; }
    saveJson('collections', loadJson('collections').filter((c) => c.id !== id));
  },

  // ---- users ----
  async listUsers() {
    if (usingPg) return rows('SELECT * FROM users ORDER BY joined_at DESC');
    return loadJson('users');
  },
  async upsertUser(user) {
    if (usingPg) {
      await pool.query(`INSERT INTO users (id,name,username,joined_at) VALUES ($1,$2,$3,$4)
        ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name,username=EXCLUDED.username`,
        [user.id, user.name || '', user.username || '', user.joinedAt || Date.now()]);
      return;
    }
    const users = loadJson('users');
    const idx = users.findIndex((u) => u.id === user.id);
    if (idx >= 0) users[idx] = user; else users.push(user);
    saveJson('users', users);
  },

  // ---- favorites ----
  async addFavorite(userId, gameId) {
    if (usingPg) {
      await pool.query('INSERT INTO favorites (user_id,game_id,created_at) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [userId, gameId, Date.now()]);
      return;
    }
    const f = loadJson('favorites');
    if (!f.some((x) => x.userId === userId && x.gameId === gameId)) { f.push({ userId, gameId, createdAt: Date.now() }); saveJson('favorites', f); }
  },
  async removeFavorite(userId, gameId) {
    if (usingPg) { await pool.query('DELETE FROM favorites WHERE user_id=$1 AND game_id=$2', [userId, gameId]); return; }
    saveJson('favorites', loadJson('favorites').filter((x) => !(x.userId === userId && x.gameId === gameId)));
  },
  async listFavorites(userId) {
    if (usingPg) return rows('SELECT g.* FROM favorites f JOIN games g ON g.id=f.game_id WHERE f.user_id=$1 ORDER BY f.created_at DESC', [userId]);
    const games = loadJson('games');
    return loadJson('favorites').filter((x) => x.userId === userId).map((x) => games.find((g) => g.id === x.gameId)).filter(Boolean);
  },

  // ---- history / stats ----
  async addHistory(userId, gameId, action) {
    if (usingPg) { await pool.query('INSERT INTO history (user_id,game_id,action,created_at) VALUES ($1,$2,$3,$4)', [userId, gameId, action, Date.now()]); return; }
    const h = loadJson('history');
    h.push({ userId, gameId, action, createdAt: Date.now() });
    saveJson('history', h);
  },
  async topGames(limit = 10) {
    if (usingPg) return rows('SELECT * FROM games ORDER BY downloads DESC LIMIT $1', [limit]);
    return [...loadJson('games')].sort((a, b) => (b.downloads || 0) - (a.downloads || 0)).slice(0, limit);
  },
  async totalDownloads() {
    if (usingPg) return (await rows('SELECT COALESCE(SUM(downloads),0) AS sum FROM games'))[0]?.sum || 0;
    return loadJson('games').reduce((s, g) => s + (g.downloads || 0), 0);
  },
};

// Обратная совместимость: старый db-интерфейс (используется частью кода)
export const db = {
  games: { load: () => null, save: () => {} },
  news: { load: () => null, save: () => {} },
  collections: { load: () => null, save: () => {} },
  users: { load: () => null, save: () => {} },
};

export async function initDb() {
  if (usingPg) {
    await ensureTables(pool);
  }
}
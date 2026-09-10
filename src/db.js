import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || join(__dirname, '..', 'data');

if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

function load(name) {
  const p = join(DATA_DIR, `${name}.json`);
  if (!existsSync(p)) return [];
  try { return JSON.parse(readFileSync(p, 'utf-8')); } catch { return []; }
}

function save(name, data) {
  writeFileSync(join(DATA_DIR, `${name}.json`), JSON.stringify(data, null, 2), 'utf-8');
}

export const db = {
  games: { load: () => load('games'), save: (d) => save('games', d) },
  news: { load: () => load('news'), save: (d) => save('news', d) },
  collections: { load: () => load('collections'), save: (d) => save('collections', d) },
  users: { load: () => load('users'), save: (d) => save('users', d) },
};
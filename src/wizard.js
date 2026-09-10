// Внутренний конечный автомат визардов: каждый пользователь имеет одно активное
// состояние (flow). Хендлеры ставят state, роутер ловит последующие сообщения.
// Позволяет хранить промежуточные данные визарда, не привязываясь к библиотеке.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
const STATE_FILE = join(DATA_DIR, 'wizard-state.json');

const states = {};
let lastSave = 0;

export function getState(chatId) {
  return states[chatId] || null;
}

export function setState(chatId, state) {
  states[chatId] = state;
  debounceSave();
}

export function clearState(chatId) {
  delete states[chatId];
  debounceSave();
}

function debounceSave() {
  const now = Date.now();
  if (now - lastSave > 2000) {
    lastSave = now;
    writeFileSync(STATE_FILE, JSON.stringify(states, null, 2), 'utf-8');
  }
}

export function restoreState() {
  try {
    if (existsSync(STATE_FILE)) {
      Object.assign(states, JSON.parse(readFileSync(STATE_FILE, 'utf-8')));
    }
  } catch {}
}

restoreState();
import 'dotenv/config';
import { createServer } from 'node:http';
import { Telegraf, Markup } from 'telegraf';
import { getState, setState, clearState } from './wizard.js';
import {
  searchGames, getGame, addGame, updateGame, removeGame, listGames, latestGames, topGames, totalGames, incDownloads,
} from './games.js';
import { addNews, listNews, getNews } from './news.js';
import { listCollections, getCollection } from './collections.js';
import { adminPanel, adminMiddleware, handleWizardStep, handleAdminCallback, broadcast } from './admin.js';
import { isAdmin, fmtSize } from './util.js';
import { store } from './db.js';

const BOT_TOKEN = process.env.BOT_TOKEN;
const BOT_USERNAME = process.env.BOT_USERNAME || '@AllGamesIntoTG';

if (!BOT_TOKEN) {
  console.error('BOT_TOKEN отсутствует в .env');
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

// Список команд + кнопка меню «≡» внизу чата — настраивается при старте
async function setupCommands() {
  const commands = [
    { command: '/start', description: '♻️ Перезапустить бота' },
    { command: '/search', description: '🔍 Поиск игры' },
    { command: '/games', description: '🎮 Все игры' },
    { command: '/latest', description: '🆕 Новинки' },
    { command: '/top', description: '🏆 Топ игр' },
    { command: '/news', description: '📰 Новости' },
    { command: '/collections', description: '📁 Подборки' },
    { command: '/help', description: '❓ Помощь' },
    { command: '/admin', description: '🛠 Админ-панель' },
  ];
  try {
    await bot.telegram.setMyCommands(commands);
    await bot.telegram.setChatMenuButton({ menu_button: { type: 'commands' } });
    console.log('✅ Меню команд и кнопка «≡» настроены');
  } catch (e) {
    console.error('Не удалось настроить меню команд:', e.message);
  }
}
setupCommands();

// ---- Регистрация пользователя ----
bot.use(async (ctx, next) => {
  if (ctx.from) {
    try {
      await store.upsertUser({
        id: ctx.from.id,
        name: ctx.from.first_name || '',
        username: ctx.from.username || '',
        joinedAt: Date.now(),
      });
    } catch { /* не критично */ }
  }
  return next();
});

// ============ МЕНЮ ============
function mainMenu() {
  return Markup.keyboard([
    ['🔍 Поиск', '📰 Новости'],
    ['📁 Подборки', '🎮 Все игры'],
    ['🆕 Новинки', '🏆 Топ'],
    ['❓ Помощь'],
  ]).resize();
}

function escapeMarkdown(text) {
  return String(text).replace(/([_*[\]()~`>#+\-=|{}.!])/g, '\\$1');
}

const kb = (...rows) => ({ reply_markup: Markup.inlineKeyboard(rows).reply_markup });
const backBtn = (data) => [Markup.button.callback('⬅ Назад', data || 'menu')];

// ============ ПАБЛИК-КОМАНДЫ ============
bot.start((ctx) => {
  ctx.reply(
    `🎮 *AllGamesIntoTG* — каталог игр в Telegram!\n\n` +
    `🔍 Ищите игры, смотрите новости и подборки, скачивайте APK.\n\n` +
    `Команды:\n` +
    `/help — Помощь\n` +
    `/search — Поиск игры\n` +
    `/news — Новости\n` +
    `/collections — Подборки\n` +
    `/latest — Последние добавленные\n` +
    `/games — Все игры\n` +
    `/top — Топ игр`,
    { parse_mode: 'Markdown', reply_markup: mainMenu() }
  );
});

bot.help((ctx) => {
  ctx.reply(
    `🎮 *AllGamesIntoTG*\n\n` +
    `🔍 *Поиск*: /search или кнопка «🔍 Поиск»\n` +
    `📰 *Новости*: /news\n` +
    `📁 *Подборки*: /collections\n` +
    `🎮 *Каталог*: /games\n` +
    `🆕 *Новинки*: /latest\n` +
    `🏆 *Топ*: /top\n` +
    `📥 *Скачивание*: в карточке игры кнопка «📥 Скачать»\n\n` +
    `*Для админа:* /admin`,
    { parse_mode: 'Markdown', reply_markup: mainMenu() }
  );
});

bot.command('menu', (ctx) => ctx.reply('Меню:', { reply_markup: mainMenu() }));

// ---- Поиск ----
bot.command('search', async (ctx) => {
  const q = ctx.message.text.replace(/^\/search\s*/, '').trim();
  if (!q) {
    setState(ctx.chat.id, { flow: 'search', step: 'query' });
    return ctx.reply('Введите *название игры* для поиска:', { parse_mode: 'Markdown' });
  }
  return doSearch(ctx, q);
});

async function doSearch(ctx, q) {
  const results = await searchGames(q);
  if (!results.length) {
    return ctx.reply('🤷 Ничего не найдено. Попробуйте другое название.');
  }
  return showGameList(ctx, results, 0, `🔍 *Результаты по запросу «${escapeMarkdown(q)}»*`);
}

// ---- Список игр (общий рендер с пагинацией по 5) ----
async function showGameList(ctx, games, page, title) {
  const total = games.length;
  const start = page * 5;
  const slice = games.slice(start, start + 5);
  const lines = slice.map((g, i) =>
    `${start + i + 1}. *${escapeMarkdown(g.title)}*${g.genres?.length ? '\n   🏷 ' + g.genres.map(escapeMarkdown).join(', ') : ''}${g.files?.length ? ` 📦(${g.files.length})` : ''}`
  ).join('\n\n');
  const buttons = slice.map((g) =>
    [Markup.button.callback(`🎮 ${g.title.slice(0, 25)}`, `game:${g.id}`)]
  );
  const nav = [];
  if (page > 0) nav.push(Markup.button.callback('⬅', `res:${page - 1}`));
  if ((page + 1) * 5 < total) nav.push(Markup.button.callback('➡', `res:${page + 1}`));
  if (nav.length) buttons.push(nav);
  buttons.push(backBtn());
  return ctx.reply(`${title} (${total})\n\n${lines}`, { parse_mode: 'Markdown', ...kb(...buttons) });
}

// ---- Все игры ----
bot.command('games', async (ctx) => {
  const games = await listGames(0, 100);
  if (!games.length) return ctx.reply('Пока нет игр в базе.');
  return showGameList(ctx, games, 0, '🎮 *Все игры*');
});

// ---- Новинки ----
bot.command('latest', async (ctx) => {
  const games = await latestGames(20);
  if (!games.length) return ctx.reply('Пока нет игр в базе.');
  return showGameList(ctx, games, 0, '🆕 *Последние новинки*');
});

// ---- Топ ----
bot.command('top', async (ctx) => {
  const games = await topGames(20);
  if (!games.length) return ctx.reply('Пока нет игр в базе.');
  return showGameList(ctx, games, 0, '🏆 *Топ игр по скачиваниям*');
});

// ---- Новости ----
bot.command('news', async (ctx) => {
  const news = await listNews(10);
  if (!news.length) return ctx.reply('Новостей пока нет.');
  const lines = news.map((n, i) => `${i + 1}. ${escapeMarkdown(n.title)}`).join('\n');
  const buttons = news.slice(0, 5).map((n) =>
    [Markup.button.callback(`📰 ${n.title.slice(0, 30)}`, `news:${n.id}`)]
  );
  buttons.push(backBtn());
  ctx.reply(`📰 *Последние новости*\n\n${lines}`, { parse_mode: 'Markdown', ...kb(...buttons) });
});

// ---- Подборки ----
bot.command('collections', async (ctx) => {
  const cols = await listCollections();
  if (!cols.length) return ctx.reply('Подборок пока нет.');
  const lines = cols.map((c, i) => `${i + 1}. *${escapeMarkdown(c.title)}* — ${c.gameIds.length} игр`).join('\n');
  const buttons = cols.map((c) => [Markup.button.callback(`📁 ${c.title}`, `collection:${c.id}`)]);
  buttons.push(backBtn());
  ctx.reply(`📁 *Подборки*\n\n${lines}`, { parse_mode: 'Markdown', ...kb(...buttons) });
});

// ---- Админ ----
bot.command('admin', adminMiddleware, (ctx) => adminPanel(ctx));
bot.command('broadcast', adminMiddleware, broadcast);

// ============ ТЕКСТ ============
bot.on('text', async (ctx) => {
  const text = ctx.message.text;
  const st = getState(ctx.chat.id);

  // Сессия поиска
  if (st && st.flow === 'search' && st.step === 'query') {
    clearState(ctx.chat.id);
    return doSearch(ctx, text);
  }

  // Визард
  if (st && handleWizardStep(ctx, text)) return;

  // Меню
  switch (text) {
    case '🔍 Поиск': setState(ctx.chat.id, { flow: 'search', step: 'query' }); return ctx.reply('Введите *название игры*:', { parse_mode: 'Markdown' });
    case '📰 Новости': return ctx.reply('Введите /news');
    case '📁 Подборки': return ctx.reply('Введите /collections');
    case '🎮 Все игры': return ctx.reply('Введите /games');
    case '🆕 Новинки': return ctx.reply('Введите /latest');
    case '🏆 Топ': return ctx.reply('Введите /top');
    case '❓ Помощь': return ctx.reply('Введите /help');
    default:
      return ctx.reply('Не понял. Используйте /help или меню ниже.', { reply_markup: mainMenu() });
  }
});

// ============ ФАЙЛЫ (APK) ============
bot.on('document', async (ctx) => {
  const st = getState(ctx.chat.id);
  const doc = ctx.message.document;

  // Добавление игры: приём нескольких APK-файлов
  if (st && st.flow === 'add-game' && st.step === 'file' && isAdmin(ctx.from.id)) {
    const data = st.data;
    data.files = data.files || [];
    // первый файл (для обратной совместимости) храним также отдельно
    if (!data.fileId) {
      data.fileId = doc.file_id;
      data.fileName = doc.file_name;
      data.fileSize = doc.file_size;
    }
    data.files.push({
      fileId: doc.file_id,
      fileName: doc.file_name,
      fileSize: doc.file_size,
      mime: doc.mime_type || '',
    });
    setState(ctx.chat.id, { ...st, data });
    return ctx.reply(
      `📦 Добавлено: *${escapeMarkdown(doc.file_name || 'файл')}* (${fmtSize(doc.file_size)})\n\n` +
      `Всего файлов: ${data.files.length}\n\n` +
      `Отправьте ещё APK или напишите /done для сохранения.`,
      { parse_mode: 'Markdown' }
    );
  }

  return ctx.reply('Файлы принимаются только от админа при добавлении игры.');
});

// ============ ФОТО ============
bot.on('photo', async (ctx) => {
  const st = getState(ctx.chat.id);

  if (st && st.flow === 'add-news' && st.step === 'image' && isAdmin(ctx.from.id)) {
    const data = st.data;
    data.imageUrl = ctx.message.photo[ctx.message.photo.length - 1].file_id;
    const item = await addNews(data);
    clearState(ctx.chat.id);
    return ctx.reply(`✅ Новость «${item.title}» создана!`);
  }

  if (st && st.flow === 'edit-game' && st.step === 'cover-photo' && isAdmin(ctx.from.id)) {
    const data = st.data;
    await updateGame(data.gameId, { coverUrl: ctx.message.photo[ctx.message.photo.length - 1].file_id });
    setState(ctx.chat.id, { ...st, step: 'which-field' });
    return ctx.reply('✅ Обложка обновлена. Что ещё изменить? (или "done")');
  }
});

// ============ CALLBACK ============
bot.on('callback_query', async (ctx) => {
  const data = ctx.callbackQuery?.data || '';
  ctx.answerCbQuery().catch(() => {});

  // Админские
  if (data.startsWith('admin:') || data.startsWith('wiz:')) {
    return handleAdminCallback(ctx);
  }

  // Пагинация списка (res:page) — список хранится в сессии не всегда,
  // поэтому используем последний список из общего контекста: для простоты
  // пагинация по «всем играм» пересоздаётся через /games; тут обрабатываем
  // только переходы вперёд/назад по сохранённому списку в памяти.
  if (data.startsWith('res:')) {
    const page = parseInt(data.split(':')[1], 10) || 0;
    const games = await listGames(0, 100);
    if (!games.length) return ctx.answerCbQuery('Список пуст');
    const title = '🎮 *Каталог*';
    const total = games.length;
    const start = page * 5;
    const slice = games.slice(start, start + 5);
    const lines = slice.map((g, i) =>
      `${start + i + 1}. *${escapeMarkdown(g.title)}*${g.files?.length ? ` 📦(${g.files.length})` : ''}`
    ).join('\n\n');
    const buttons = slice.map((g) => [Markup.button.callback(`🎮 ${g.title.slice(0, 25)}`, `game:${g.id}`)]);
    const nav = [];
    if (page > 0) nav.push(Markup.button.callback('⬅', `res:${page - 1}`));
    if ((page + 1) * 5 < total) nav.push(Markup.button.callback('➡', `res:${page + 1}`));
    if (nav.length) buttons.push(nav);
    buttons.push(backBtn());
    return ctx.editMessageText(`${title} (${total})\n\n${lines}`, { parse_mode: 'Markdown', ...kb(...buttons) });
  }

  // Карточка игры
  if (data.startsWith('game:')) {
    const id = data.split(':')[1];
    const game = await getGame(id);
    if (!game) return ctx.answerCbQuery('Игра не найдена');
    const text = renderGameCard(game);
    const buttons = gameButtons(game);
    if (game.coverUrl) {
      return ctx.replyWithPhoto(game.coverUrl, { caption: text, parse_mode: 'Markdown', ...kb(...buttons) });
    }
    return ctx.reply(text, { parse_mode: 'Markdown', ...kb(...buttons) });
  }

  // Выбор файла из нескольких (dl:gameId:index)
  if (data.startsWith('dl:')) {
    const parts = data.split(':');
    const id = parts[1];
    const idx = parseInt(parts[2], 10) || 0;
    const game = await getGame(id);
    if (!game) return ctx.answerCbQuery('Игра не найдена');
    const files = game.files || [];
    const file = files[idx] || { fileId: game.fileId, fileName: game.fileName, fileSize: game.fileSize };
    if (!file?.fileId) return ctx.answerCbQuery('Файл недоступен');
    ctx.answerCbQuery('Отправляю файл…').catch(() => {});
    try {
      await incDownloads(id);
      await ctx.telegram.sendDocument(ctx.chat.id, file.fileId, { caption: `🎮 ${game.title}` });
    } catch {
      ctx.reply('⚠️ Файл недоступен. Попросите администратора обновить.');
    }
    return;
  }

  // Скачивание (один файл или меню выбора)
  if (data.startsWith('download:')) {
    const id = data.split(':')[1];
    const game = await getGame(id);
    if (!game) return ctx.answerCbQuery('Игра не найдена');
    const files = game.files || [];
    if (files.length > 1) {
      const buttons = files.map((f, i) =>
        [Markup.button.callback(`📥 ${f.fileName || `Файл ${i + 1}`}`, `dl:${id}:${i}`)]
      );
      buttons.push(backBtn(`game:${id}`));
      return ctx.reply(`📦 *${escapeMarkdown(game.title)}* — выберите файл:`, { parse_mode: 'Markdown', ...kb(...buttons) });
    }
    const file = files[0] || { fileId: game.fileId, fileName: game.fileName, fileSize: game.fileSize };
    if (!file?.fileId) return ctx.answerCbQuery('Файл недоступен');
    ctx.answerCbQuery('Отправляю файл…').catch(() => {});
    try {
      await incDownloads(id);
      await ctx.telegram.sendDocument(ctx.chat.id, file.fileId, { caption: `🎮 ${game.title}` });
    } catch {
      ctx.reply('⚠️ Файл недоступен. Попросите администратора обновить.');
    }
    return;
  }

  // Просмотр новости
  if (data.startsWith('news:')) {
    const id = data.split(':')[1];
    const n = await getNews(id);
    if (!n) return ctx.answerCbQuery('Новость не найдена');
    const text = `📰 *${escapeMarkdown(n.title)}*\n\n${escapeMarkdown(n.text)}\n\n🕐 ${new Date(n.createdAt).toLocaleDateString('ru-RU')}`;
    if (n.imageUrl) {
      return ctx.replyWithPhoto(n.imageUrl, { caption: text, parse_mode: 'Markdown', ...kb(backBtn()) });
    }
    return ctx.reply(text, { parse_mode: 'Markdown', ...kb(backBtn()) });
  }

  // Подборка
  if (data.startsWith('collection:')) {
    const id = data.split(':')[1];
    const c = await getCollection(id);
    if (!c) return ctx.answerCbQuery('Не найдено');
    const games = [];
    for (const gid of c.gameIds) {
      const g = await getGame(gid);
      if (g) games.push(g);
    }
    if (!games.length) {
      return ctx.reply(`📁 *${escapeMarkdown(c.title)}*\n\nПодборка пуста.`, { parse_mode: 'Markdown', ...kb(backBtn('collections')) });
    }
    const buttons = games.map((g) => [Markup.button.callback(`🎮 ${g.title.slice(0, 30)}`, `game:${g.id}`)]);
    buttons.push(backBtn('collections'));
    return ctx.reply(
      `📁 *${escapeMarkdown(c.title)}*\n\n${c.description ? escapeMarkdown(c.description) + '\n\n' : ''}🎮 *Игры:*\n${games.map((g) => `• ${escapeMarkdown(g.title)}`).join('\n')}`,
      { parse_mode: 'Markdown', ...kb(...buttons) }
    );
  }

  // Пустышка menu / назад
  if (data === 'menu' || data === 'collections' || data === 'back') {
    return ctx.reply('Главное меню:', { reply_markup: mainMenu() });
  }
});

function renderGameCard(game) {
  const lines = [
    `🎮 *${escapeMarkdown(game.title)}*`,
    game.description ? `\n${escapeMarkdown(game.description).slice(0, 500)}` : '',
    game.genres?.length ? `\n🏷 *Жанры:* ${game.genres.map(escapeMarkdown).join(', ')}` : '',
    game.platforms?.length ? `🖥 *Платформы:* ${game.platforms.map(escapeMarkdown).join(', ')}` : '',
    game.links?.store ? `\n🔗 [Официальный магазин](${game.links.store})` : '',
    game.files?.length ? `\n📦 *Файлов:* ${game.files.length}` : '',
    (game.downloads || 0) ? `\n📥 Скачиваний: ${game.downloads}` : '',
  ];
  return lines.join('\n');
}

function gameButtons(game) {
  const buttons = [];
  const hasFile = game.files?.length || game.fileId;
  if (hasFile) {
    buttons.push([Markup.button.callback('📥 Скачать', `download:${game.id}`)]);
  }
  buttons.push(backBtn());
  return buttons;
}

// ============ ЗАПУСК (Render: long polling + health-сервер) ============
const PORT = process.env.PORT || 3000;

bot.catch((err) => {
  console.error('Bot error:', err?.message || err);
});

const server = createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('AllGamesIntoTG bot is running');
  }
  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Health server listening on 0.0.0.0:${PORT}`);
});

bot.launch().then(async () => {
  console.log(`🤖 Бот запущен: ${BOT_USERNAME}`);
  console.log(`Админ: ${isAdmin(8542930176) ? 'да (8542930176)' : 'ID не настроен'}`);
}).catch((err) => {
  console.error('Bot launch failed:', err.message);
  process.exit(1);
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
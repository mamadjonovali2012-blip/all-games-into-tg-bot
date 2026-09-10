import 'dotenv/config';
import { createServer } from 'node:http';
import { Telegraf, Markup } from 'telegraf';
import { db } from './db.js';
import { getState, setState, clearState } from './wizard.js';
import {
  searchGames, getGame, addGame, listGames, latestGames,
} from './games.js';
import { addNews, listNews, getNews } from './news.js';
import { listCollections, getCollection } from './collections.js';
import { adminPanel, adminMiddleware, handleWizardStep, handleAdminCallback, broadcast } from './admin.js';
import { isAdmin, fmtSize, esc } from './util.js';
import { searchRAWGGames } from './rawg.js';

const BOT_TOKEN = process.env.BOT_TOKEN;
const BOT_USERNAME = process.env.BOT_USERNAME || '@AllGamesIntoTG';
const PORT = process.env.PORT || 3000;
const URL = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;

if (!BOT_TOKEN) {
  console.error('BOT_TOKEN отсутствует в .env');
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

// ---- Регистрация пользователя ----
bot.use((ctx, next) => {
  if (ctx.from) {
    const users = db.users.load();
    const existing = users.find((u) => u.id === ctx.from.id);
    if (!existing) {
      users.push({ id: ctx.from.id, name: ctx.from.first_name || '', username: ctx.from.username || '', joinedAt: Date.now() });
      db.users.save(users);
    } else {
      existing.name = ctx.from.first_name || existing.name;
      existing.username = ctx.from.username || existing.username;
      db.users.save(users);
    }
  }
  return next();
});

function mainMenu() {
  return Markup.keyboard([
    ['🔍 Поиск', '📰 Новости'],
    ['📁 Подборки', '🎮 Все игры'],
    ['🆕 Новинки', '❓ Помощь'],
  ]).resize();
}

function escapeMarkdown(text) {
  return String(text).replace(/([_*[\]()~`>#+\-=|{}.!])/g, '\\$1');
}

// ============ КОМАНДЫ ============
bot.start((ctx) => {
  ctx.reply(
    `🎮 *AllGamesIntoTG* — каталог игр в Telegram!\n\n🔍 Ищите игры, смотрите новости и подборки, скачивайте файлы.\n\n` +
    `/help — Помощь\n/search — Поиск игры\n/news — Новости\n/collections — Подборки\n/latest — Новинки\n/games — Все игры`,
    { parse_mode: 'Markdown', reply_markup: mainMenu() }
  );
});

bot.help((ctx) => {
  ctx.reply(
    `🎮 *AllGamesIntoTG*\n\n🔍 *Поиск*: /search\n📰 *Новости*: /news\n📁 *Подборки*: /collections\n` +
    `🎮 *Каталог*: /games\n🆕 *Новинки*: /latest\n📥 *Скачивание*: в карточке кнопка «📥 Скачать»\n\n*Для админа:* /admin`,
    { parse_mode: 'Markdown', reply_markup: mainMenu() }
  );
});

bot.command('menu', (ctx) => ctx.reply('Меню:', { reply_markup: mainMenu() }));

// ---- Поиск ----
bot.command('search', async (ctx) => {
  const q = ctx.message.text.replace(/^\/search\s*/, '').trim();
  if (!q) { setState(ctx.chat.id, { flow: 'search', step: 'query' }); return ctx.reply('Введите *название игры* для поиска:', { parse_mode: 'Markdown' }); }
  return doSearch(ctx, q);
});

async function doSearch(ctx, q) {
  const results = searchGames(q);
  if (!results.length) {
    const external = await searchRAWGGames(q);
    if (external.length) {
      const lines = external.map((g, i) => `${i + 1}. ${escapeMarkdown(g.title)} (${g.released || '?'})`).join('\n');
      return ctx.reply(`🔍 В базе не нашлось, но вот извне:\n\n${lines}\n\nПопросите администратора добавить.`, { parse_mode: 'Markdown' });
    }
    return ctx.reply('🤷 Ничего не найдено. Попробуйте другое название.');
  }
  const total = results.length;
  const slice = results.slice(0, 5);
  const lines = slice.map((g, i) => `${i + 1}. *${escapeMarkdown(g.title)}*${g.genres?.length ? '\n   🏷 ' + g.genres.map(escapeMarkdown).join(', ') : ''}${g.fileId ? ' 📦' : ''}`).join('\n\n');
  const buttons = slice.map((g) => [Markup.button.callback(`🎮 ${g.title.slice(0, 25)}`, `game:${g.id}`)]);
  if (5 < total) buttons.push([Markup.button.callback('➡', `res:1:${q}`)]);
  return ctx.reply(`🔍 *Результаты* (${total})\n\n${lines}`, { parse_mode: 'Markdown', reply_markup: Markup.inlineKeyboard(buttons).reply_markup });
}

bot.command('latest', async (ctx) => {
  const games = latestGames(5);
  if (!games.length) return ctx.reply('Пока нет игр в базе.');
  const lines = games.map((g, i) => `${i + 1}. *${escapeMarkdown(g.title)}*${g.genres?.length ? '\n   🏷 ' + g.genres.map(escapeMarkdown).join(', ') : ''}`).join('\n\n');
  const buttons = games.map((g) => [Markup.button.callback(`🎮 ${g.title.slice(0, 25)}`, `game:${g.id}`)]);
  return ctx.reply(`🆕 *Новинки*\n\n${lines}`, { parse_mode: 'Markdown', reply_markup: Markup.inlineKeyboard(buttons).reply_markup });
});

bot.command('games', async (ctx) => {
  const games = listGames(0, 10);
  if (!games.length) return ctx.reply('Пока нет игр в базе.');
  const lines = games.map((g, i) => `${i + 1}. *${escapeMarkdown(g.title)}*${g.genres?.length ? ` (${g.genres.join(', ')})` : ''}`).join('\n');
  const buttons = games.map((g) => [Markup.button.callback(`🎮 ${g.title.slice(0, 25)}`, `game:${g.id}`)]);
  buttons.push([Markup.button.callback('➡ Ещё', 'games:page:1')]);
  return ctx.reply(`🎮 *Все игры*\n\n${lines}`, { parse_mode: 'Markdown', reply_markup: Markup.inlineKeyboard(buttons).reply_markup });
});

bot.command('news', (ctx) => {
  const news = listNews(10);
  if (!news.length) return ctx.reply('Новостей пока нет.');
  const buttons = news.slice(0, 5).map((n) => [Markup.button.callback(`📰 ${n.title.slice(0, 30)}`, `news:${n.id}`)]);
  ctx.reply(`📰 *Последние новости*\n\n${news.map((n, i) => `${i + 1}. ${escapeMarkdown(n.title)}`).join('\n')}`, { parse_mode: 'Markdown', reply_markup: Markup.inlineKeyboard(buttons).reply_markup });
});

bot.command('collections', (ctx) => {
  const cols = listCollections();
  if (!cols.length) return ctx.reply('Подборок пока нет.');
  const buttons = cols.map((c) => [Markup.button.callback(`📁 ${c.title}`, `collection:${c.id}`)]);
  ctx.reply(`📁 *Подборки*\n\n${cols.map((c, i) => `${i + 1}. *${escapeMarkdown(c.title)}* — ${c.gameIds.length} игр`).join('\n')}`, { parse_mode: 'Markdown', reply_markup: Markup.inlineKeyboard(buttons).reply_markup });
});

bot.command('admin', adminMiddleware, (ctx) => adminPanel(ctx));
bot.command('broadcast', adminMiddleware, broadcast);

// ============ ТЕКСТ ============
bot.on('text', async (ctx) => {
  const text = ctx.message.text;
  const st = getState(ctx.chat.id);
  if (st && st.flow === 'search' && st.step === 'query') { clearState(ctx.chat.id); return doSearch(ctx, text); }
  if (st && handleWizardStep(ctx, text)) return;
  switch (text) {
    case '🔍 Поиск': setState(ctx.chat.id, { flow: 'search', step: 'query' }); return ctx.reply('Введите *название игры*:', { parse_mode: 'Markdown' });
    case '📰 Новости': return ctx.reply('Введите /news');
    case '📁 Подборки': return ctx.reply('Введите /collections');
    case '🎮 Все игры': return ctx.reply('Введите /games');
    case '🆕 Новинки': return ctx.reply('Введите /latest');
    case '❓ Помощь': return ctx.reply('Введите /help');
    default: return ctx.reply('Не понял. Используйте /help или меню ниже.', { reply_markup: mainMenu() });
  }
});

// ============ ФАЙЛЫ / ФОТО ============
bot.on('document', async (ctx) => {
  const st = getState(ctx.chat.id);
  const doc = ctx.message.document;
  if (st && st.flow === 'add-game' && st.step === 'file' && isAdmin(ctx.from.id)) {
    const data = st.data; data.fileId = doc.file_id; data.fileName = doc.file_name; data.fileSize = doc.file_size;
    const game = addGame(data); clearState(ctx.chat.id);
    return ctx.reply(`✅ *Игра добавлена!*\n\n🎮 ${escapeMarkdown(game.title)}\n📦 ${game.fileName} (${fmtSize(game.fileSize)})`, { parse_mode: 'Markdown' });
  }
  return ctx.reply('Файлы принимаются только от админа при добавлении игры.');
});

bot.on('photo', async (ctx) => {
  const st = getState(ctx.chat.id);
  const photo = ctx.message.photo[ctx.message.photo.length - 1].file_id;
  if (st && st.flow === 'add-game' && st.step === 'cover' && isAdmin(ctx.from.id)) {
    st.data.coverUrl = photo; setState(ctx.chat.id, { ...st, step: 'file' });
    return ctx.reply('📎 Отправьте *файл игры* (zip/rar/7z/exe) или /skip:', { parse_mode: 'Markdown' });
  }
  if (st && st.flow === 'add-news' && st.step === 'image' && isAdmin(ctx.from.id)) {
    st.data.imageUrl = photo; const item = addNews(st.data); clearState(ctx.chat.id);
    return ctx.reply(`✅ Новость «${item.title}» создана!`);
  }
});

// ============ CALLBACK ============
bot.on('callback_query', async (ctx) => {
  const data = ctx.data;
  ctx.answerCbQuery().catch(() => {});
  if (data.startsWith('admin:') || data.startsWith('wiz:')) return handleAdminCallback(ctx);

  if (data.startsWith('res:')) {
    const parts = data.split(':'); const page = parseInt(parts[1], 10); const q = parts.slice(2).join(':');
    const results = searchGames(q); const total = results.length; const start = page * 5; const slice = results.slice(start, start + 5);
    const lines = slice.map((g, i) => `${start + i + 1}. *${escapeMarkdown(g.title)}*${g.genres?.length ? '\n   🏷 ' + g.genres.join(', ') : ''}${g.fileId ? ' 📦' : ''}`).join('\n\n');
    const buttons = slice.map((g) => [Markup.button.callback(`🎮 ${g.title.slice(0, 25)}`, `game:${g.id}`)]);
    const nav = []; if (page > 0) nav.push(Markup.button.callback('⬅', `res:${page - 1}:${q}`));
    if ((page + 1) * 5 < total) nav.push(Markup.button.callback('➡', `res:${page + 1}:${q}`));
    if (nav.length) buttons.push(nav);
    return ctx.editMessageText(`🔍 *Результаты* (${total})\n\n${lines}`, { parse_mode: 'Markdown', reply_markup: Markup.inlineKeyboard(buttons).reply_markup });
  }

  if (data.startsWith('game:')) {
    const id = data.split(':')[1]; const game = getGame(id);
    if (!game) return ctx.answerCbQuery('Игра не найдена');
    const text = renderGameCard(game); const buttons = gameButtons(game);
    if (game.coverUrl) return ctx.editMessageMedia({ type: 'photo', media: game.coverUrl, caption: text, parse_mode: 'Markdown' }, { reply_markup: Markup.inlineKeyboard(buttons).reply_markup });
    return ctx.editMessageText(text, { parse_mode: 'Markdown', reply_markup: Markup.inlineKeyboard(buttons).reply_markup });
  }

  if (data.startsWith('download:')) {
    const id = data.split(':')[1]; const game = getGame(id);
    if (!game || !game.fileId) return ctx.answerCbQuery('Файл недоступен');
    ctx.answerCbQuery('Отправляю файл…').catch(() => {});
    try { await ctx.telegram.sendDocument(ctx.chat.id, game.fileId, { caption: `🎮 ${game.title}` }); } catch { ctx.reply('⚠️ Файл недоступен.'); }
    return;
  }

  if (data.startsWith('news:')) {
    const id = data.split(':')[1]; const n = getNews(id);
    if (!n) return ctx.answerCbQuery('Не найдено');
    const text = `📰 *${escapeMarkdown(n.title)}*\n\n${escapeMarkdown(n.text)}\n\n🕐 ${new Date(n.createdAt).toLocaleDateString('ru-RU')}`;
    if (n.imageUrl) return ctx.editMessageMedia({ type: 'photo', media: n.imageUrl, caption: text, parse_mode: 'Markdown' }, { reply_markup: Markup.inlineKeyboard([[Markup.button.callback('⬅ Назад', 'menu')]]).reply_markup });
    return ctx.editMessageText(text, { parse_mode: 'Markdown', reply_markup: Markup.inlineKeyboard([[Markup.button.callback('⬅ Назад', 'menu')]]).reply_markup });
  }

  if (data.startsWith('collection:')) {
    const id = data.split(':')[1]; const c = getCollection(id);
    if (!c) return ctx.answerCbQuery('Не найдено');
    const glist = c.gameIds.map((gid) => getGame(gid)).filter(Boolean);
    if (!glist.length) return ctx.editMessageText(`📁 *${escapeMarkdown(c.title)}*\n\nПодборка пуста.`, { parse_mode: 'Markdown' });
    const buttons = glist.map((g) => [Markup.button.callback(`🎮 ${g.title.slice(0, 30)}`, `game:${g.id}`)]);
    return ctx.editMessageText(`📁 *${escapeMarkdown(c.title)}*\n\n${c.description ? escapeMarkdown(c.description) + '\n\n' : ''}🎮 *Игры:*\n${glist.map((g) => `• ${escapeMarkdown(g.title)}`).join('\n')}`, { parse_mode: 'Markdown', reply_markup: Markup.inlineKeyboard(buttons).reply_markup });
  }

  if (data.startsWith('games:page:')) {
    const page = parseInt(data.split(':')[2], 10); const games = listGames(page, 10);
    if (!games.length) return ctx.answerCbQuery('Больше нет');
    const buttons = games.map((g) => [Markup.button.callback(`🎮 ${g.title.slice(0, 25)}`, `game:${g.id}`)]);
    buttons.push([Markup.button.callback('➡ Ещё', `games:page:${page + 1}`)]);
    return ctx.editMessageText(`🎮 *Все игры* (стр. ${page + 1})\n\n${games.map((g, i) => `${page * 10 + i + 1}. *${escapeMarkdown(g.title)}*`).join('\n')}`, { parse_mode: 'Markdown', reply_markup: Markup.inlineKeyboard(buttons).reply_markup });
  }

  if (data === 'menu') return ctx.editMessageText('Главное меню:', { reply_markup: mainMenu().reply_markup });
});

function renderGameCard(game) {
  return [
    `🎮 *${escapeMarkdown(game.title)}*`,
    game.description ? `\n${escapeMarkdown(game.description).slice(0, 500)}` : '',
    game.genres?.length ? `\n🏷 *Жанры:* ${game.genres.map(escapeMarkdown).join(', ')}` : '',
    game.platforms?.length ? `🖥 *Платформы:* ${game.platforms.map(escapeMarkdown).join(', ')}` : '',
    game.links?.store ? `\n🔗 [Официальный магазин](${game.links.store})` : '',
    game.fileName ? `\n📦 *Файл:* ${escapeMarkdown(game.fileName)} (${fmtSize(game.fileSize)})` : '',
  ].join('\n');
}

function gameButtons(game) {
  const buttons = [];
  if (game.fileId) buttons.push([Markup.button.callback('📥 Скачать', `download:${game.id}`)]);
  buttons.push([Markup.button.callback('⬅ Назад', 'menu')]);
  return buttons;
}

// ============ HTTP-СЕРВЕР (для Render) ============
const server = createServer((req, res) => {
  // Health-check
  if (req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('AllGamesIntoTG bot is running');
  }

  // Webhook от Telegram
  if (req.method === 'POST' && req.url === '/webhook') {
    let body = '';
    req.on('data', (chunk) => body += chunk);
    req.on('end', () => {
      try { bot.handleUpdate(JSON.parse(body)); } catch (e) { console.error('webhook error', e); }
      res.writeHead(200); res.end('OK');
    });
    return;
  }

  res.writeHead(404); res.end('Not Found');
});

server.listen(PORT, async () => {
  console.log(`🌐 HTTP-сервер запущен на порту ${PORT}`);

  // На Render используем вебхук
  if (process.env.RENDER_EXTERNAL_URL) {
    try {
      const webhookUrl = `${process.env.RENDER_EXTERNAL_URL}/webhook`;
      await bot.telegram.deleteWebhook();
      await bot.telegram.setWebhook(webhookUrl);
      console.log(`✅ Webhook установлен: ${webhookUrl}`);
    } catch (e) {
      console.error('❌ Ошибка webhook:', e.message);
    }
  } else {
    // Локально — long polling
    bot.launch();
    console.log(`🤖 Бот (polling) запущен: ${BOT_USERNAME}`);
  }
});

process.once('SIGINT', () => { bot.stop('SIGINT'); server.close(); });
process.once('SIGTERM', () => { bot.stop('SIGTERM'); server.close(); });
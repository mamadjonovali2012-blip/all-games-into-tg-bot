import { setState, clearState } from './wizard.js';
import { addGame, getGame, updateGame, removeGame, listGames, totalGames } from './games.js';
import { addNews, removeNews, listNews, getNews } from './news.js';
import { createCollection, listCollections, getCollection, removeCollection } from './collections.js';
import { isAdmin, fmtSize, esc } from './util.js';
import { db } from './db.js';
import { Markup } from 'telegraf';

export function adminMiddleware(ctx, next) {
  if (!isAdmin(ctx.from.id)) {
    ctx.reply('Доступно только администратору.');
    return;
  }
  return next();
}

export function adminPanel(ctx) {
  const text = [
    '🗂 *Панель администратора*',
    '',
    `👤 Ваш ID: \`${ctx.from.id}\``,
    `🎮 Игр в базе: ${totalGames()}`,
    `📰 Новостей: ${listNews().length}`,
    `📁 Подборок: ${listCollections().length}`,
    '',
    'Выберите действие:',
  ].join('\n');
  ctx.reply(text, {
    parse_mode: 'Markdown',
    reply_markup: Markup.inlineKeyboard([
      [Markup.button.callback('➕ Добавить игру', 'wiz:game:start')],
      [Markup.button.callback('📰 Создать новость', 'wiz:news:start')],
      [Markup.button.callback('📁 Новая подборка', 'wiz:collection:start')],
      [Markup.button.callback('🔍 Управление играми', 'admin:games:list:0')],
      [Markup.button.callback('📰 Управление новостями', 'admin:news:list')],
      [Markup.button.callback('📁 Управление подборками', 'admin:collections:list')],
      [Markup.button.callback('👥 Пользователи', 'admin:users')],
      [Markup.button.callback('📢 Рассылка', 'admin:broadcast')],
    ]).reply_markup,
  });
}

// ---------- Визард: добавление игры ----------
export function gameWizardStart(ctx) {
  setState(ctx.chat.id, { flow: 'add-game', step: 'title', data: {} });
  ctx.reply('Введите *название игры*:', { parse_mode: 'Markdown' });
  return ctx.answerCbQuery();
}

// Обработчик шагов визардов — вызывается из роутера
export function handleWizardStep(ctx, text) {
  const state = getState(ctx.chat.id);
  if (!state) return false;

  // Визарды доступны только администратору
  if (!isAdmin(ctx.from.id)) {
    clearState(ctx.chat.id);
    ctx.reply('Доступно только администратору.');
    return true;
  }

  switch (state.flow) {
    case 'add-game': return handleAddGame(ctx, text, state);
    case 'add-news': return handleAddNews(ctx, text, state);
    case 'add-collection': return handleAddCollection(ctx, text, state);
    case 'edit-game': return handleEditGame(ctx, text, state);
    default: return false;
  }
}

// ---------- ВИЗАРД: добавление игры ----------
function handleAddGame(ctx, text, state) {
  const d = state.data;

  switch (state.step) {
    case 'title':
      d.title = text;
      state.step = 'description';
      ctx.reply('Введите *описание* игры (или /skip):', { parse_mode: 'Markdown' });
      return true;
    case 'description':
      if (text !== '/skip') d.description = text;
      state.step = 'genres';
      ctx.reply('Введите *жанры* через запятую (или /skip):', { parse_mode: 'Markdown' });
      return true;
    case 'genres':
      if (text !== '/skip') d.genres = text.split(',').map((s) => s.trim()).filter(Boolean);
      state.step = 'platforms';
      ctx.reply('Введите *платформы* через запятую: PC, PlayStation, Xbox, Nintendo (или /skip):', { parse_mode: 'Markdown' });
      return true;
    case 'platforms':
      if (text !== '/skip') d.platforms = text.split(',').map((s) => s.trim()).filter(Boolean);
      state.step = 'links';
      ctx.reply('Введите *ссылку* на игру (Steam/GOG/официальный магазин) или /skip:', { parse_mode: 'Markdown' });
      return true;
    case 'links':
      if (text !== '/skip') d.links = { store: text };
      state.step = 'cover';
      ctx.reply('Отправьте *обложку* (картинку) или /skip:', { parse_mode: 'Markdown' });
      return true;
    case 'cover': {
      if (text === '/skip') {
        state.step = 'file';
        ctx.reply('Отправьте *файл игры* (zip/rar/7z/exe) или /skip:', { parse_mode: 'Markdown' });
        return true;
      }
      ctx.reply('Отправьте картинку-обложку или /skip:');
      return true;
    }
    case 'file': {
      if (text === '/skip') {
        const game = addGame(d);
        clearState(ctx.chat.id);
        ctx.reply(`✅ Игра «${game.title}» добавлена без файла.`);
        return true;
      }
      ctx.reply('Отправьте файл игры (zip/rar/7z/exe) или /skip:');
      return true;
    }
    default:
      return false;
  }
}

// ---------- ВИЗАРД: новость ----------
function handleAddNews(ctx, text, state) {
  const d = state.data;

  switch (state.step) {
    case 'title':
      d.title = text;
      state.step = 'text';
      ctx.reply('Введите *текст новости*:', { parse_mode: 'Markdown' });
      return true;
    case 'text':
      d.text = text;
      state.step = 'image';
      ctx.reply('Отправьте *картинку* к новости или /skip:', { parse_mode: 'Markdown' });
      return true;
    case 'image': {
      if (text === '/skip') {
        const item = addNews(d);
        clearState(ctx.chat.id);
        ctx.reply(`✅ Новость «${item.title}» создана!`);
        return true;
      }
      ctx.reply('Отправьте картинку к новости или /skip:');
      return true;
    }
    default:
      return false;
  }
}

// ---------- ВИЗАРД: подборка ----------
function handleAddCollection(ctx, text, state) {
  const d = state.data;

  switch (state.step) {
    case 'title':
      d.title = text;
      state.step = 'description';
      ctx.reply('Введите *описание* подборки (или /skip):', { parse_mode: 'Markdown' });
      return true;
    case 'description': {
      if (text !== '/skip') d.description = text;
      const c = createCollection(d);
      clearState(ctx.chat.id);
      ctx.reply(`✅ Подборка «${c.title}» создана! ID: \`${c.id}\``, { parse_mode: 'Markdown' });
      return true;
    }
    default:
      return false;
  }
}

// ---------- ВИЗАРД: редактирование игры ----------
function handleEditGame(ctx, text, state) {
  const d = state.data;

  if (state.step === 'which-field') {
    const game = getGame(d.gameId);
    if (!game) { clearState(ctx.chat.id); ctx.reply('Игра не найдена.'); return true; }
    const field = text.toLowerCase().trim();
    const fields = ['title', 'description', 'genres', 'platforms', 'links', 'cover'];
    if (field === 'done') {
      clearState(ctx.chat.id);
      ctx.reply('✅ Редактирование завершено.');
      return true;
    }
    if (!fields.includes(field)) {
      ctx.reply('Поле не найдено. Доступны: title, description, genres, platforms, links, cover. Или "done".');
      return true;
    }
    d.field = field;
    state.step = 'value';
    ctx.reply(`Введите новое значение для \`${field}\` (или /cancel):`, { parse_mode: 'Markdown' });
    return true;
  }

  if (state.step === 'value') {
    const game = getGame(d.gameId);
    if (!game) { clearState(ctx.chat.id); ctx.reply('Игра не найдена.'); return true; }
    const patch = {};
    if (d.field === 'genres' || d.field === 'platforms') {
      patch[d.field] = text.split(',').map((s) => s.trim()).filter(Boolean);
    } else if (d.field === 'links') {
      patch.links = { store: text };
    } else {
      patch[d.field] = text;
    }
    updateGame(d.gameId, patch);
    state.step = 'which-field';
    ctx.reply(`✅ Поле \`${d.field}\` обновлено. Что ещё изменить? (или "done")`, { parse_mode: 'Markdown' });
    return true;
  }

  return false;
}

// ---------- Callback-хендлеры ----------
export async function handleAdminCallback(ctx) {
  const data = ctx.data;
  if (!isAdmin(ctx.from.id)) return ctx.answerCbQuery('Нет доступа');

  // Старт визардов
  if (data === 'wiz:game:start') return gameWizardStart(ctx);
  if (data === 'wiz:news:start') {
    setState(ctx.chat.id, { flow: 'add-news', step: 'title', data: {} });
    ctx.reply('Введите *заголовок новости*:', { parse_mode: 'Markdown' });
    return ctx.answerCbQuery();
  }
  if (data === 'wiz:collection:start') {
    setState(ctx.chat.id, { flow: 'add-collection', step: 'title', data: {} });
    ctx.reply('Введите *название подборки*:', { parse_mode: 'Markdown' });
    return ctx.answerCbQuery();
  }

  // Список игр с пагинацией
  if (data.startsWith('admin:games:list:')) {
    const page = parseInt(data.split(':')[3], 10) || 0;
    const games = listGames(page, 5);
    const total = totalGames();
    if (!games.length) {
      return ctx.editMessageText('Игр пока нет.', {
        reply_markup: Markup.inlineKeyboard([[Markup.button.callback('⬅ Назад', 'admin:back')]]).reply_markup,
      });
    }
    const lines = games.map((g, i) =>
      `${page * 5 + i + 1}. ${esc(g.title)} (${g.fileId ? '📄' : '❌ без файла'})`
    ).join('\n');
    const buttons = games.map((g) =>
      [Markup.button.callback(`✏️ ${g.title.slice(0, 25)}`, `admin:game:view:${g.id}`)]
    );
    const nav = [];
    if (page > 0) nav.push(Markup.button.callback('⬅', `admin:games:list:${page - 1}`));
    if ((page + 1) * 5 < total) nav.push(Markup.button.callback('➡', `admin:games:list:${page + 1}`));
    if (nav.length) buttons.push(nav);
    buttons.push([Markup.button.callback('⬅ Назад', 'admin:back')]);
    return ctx.editMessageText(`🎮 *Игры* (${total})\n\n${lines}`, {
      parse_mode: 'Markdown',
      reply_markup: Markup.inlineKeyboard(buttons).reply_markup,
    });
  }

  // Просмотр игры
  if (data.startsWith('admin:game:view:')) {
    const id = data.split(':')[3];
    const game = getGame(id);
    if (!game) return ctx.answerCbQuery('Игра не найдена');
    const lines = [
      `🎮 *${esc(game.title)}*`,
      game.description ? `\n${esc(game.description)}` : '',
      game.genres?.length ? `\n🏷 Жанры: ${game.genres.map(esc).join(', ')}` : '',
      game.platforms?.length ? `🖥 Платформы: ${game.platforms.map(esc).join(', ')}` : '',
      game.links?.store ? `🔗 [Ссылка](${game.links.store})` : '',
      game.fileName ? `\n📦 ${esc(game.fileName)} (${fmtSize(game.fileSize)})` : '',
    ].join('\n');
    const buttons = [
      [Markup.button.callback('✏️ Редактировать', `admin:game:edit:${id}`)],
      [Markup.button.callback('❌ Удалить', `admin:game:delete:${id}`)],
      [Markup.button.callback('⬅ К списку', 'admin:games:list:0')],
    ];
    if (game.coverUrl) {
      await ctx.editMessageMedia(
        { type: 'photo', media: game.coverUrl, caption: lines, parse_mode: 'Markdown' },
        { reply_markup: Markup.inlineKeyboard(buttons).reply_markup }
      );
    } else {
      await ctx.editMessageText(lines, { parse_mode: 'Markdown', reply_markup: Markup.inlineKeyboard(buttons).reply_markup });
    }
    return ctx.answerCbQuery();
  }

  // Редактирование игры
  if (data.startsWith('admin:game:edit:')) {
    const id = data.split(':')[3];
    setState(ctx.chat.id, { flow: 'edit-game', step: 'which-field', data: { gameId: id } });
    ctx.reply('Какое поле изменить? Напишите: title, description, genres, platforms, links, cover. Или "done".');
    return ctx.answerCbQuery();
  }

  // Удаление игры
  if (data.startsWith('admin:game:delete:')) {
    const id = data.split(':')[3];
    const game = getGame(id);
    if (game) {
      removeGame(id);
      await ctx.editMessageText(`❌ Игра «${esc(game.title)}» удалена.`, {
        reply_markup: Markup.inlineKeyboard([[Markup.button.callback('⬅ К списку', 'admin:games:list:0')]]).reply_markup,
      });
    }
    return ctx.answerCbQuery('Игра удалена');
  }

  // Новости
  if (data === 'admin:news:list') {
    const news = listNews(10);
    if (!news.length) {
      return ctx.editMessageText('Новостей нет.', {
        reply_markup: Markup.inlineKeyboard([[Markup.button.callback('⬅ Назад', 'admin:back')]]).reply_markup,
      });
    }
    const lines = news.map((n, i) => `${i + 1}. ${esc(n.title)}`).join('\n');
    const buttons = news.slice(0, 5).map((n) =>
      [Markup.button.callback(`📰 ${n.title.slice(0, 25)}`, `admin:news:view:${n.id}`)]
    );
    buttons.push([Markup.button.callback('⬅ Назад', 'admin:back')]);
    return ctx.editMessageText(`📰 *Новости*\n\n${lines}`, { parse_mode: 'Markdown', reply_markup: Markup.inlineKeyboard(buttons).reply_markup });
  }

  if (data.startsWith('admin:news:view:')) {
    const id = data.split(':')[3];
    const n = getNews(id);
    if (!n) return ctx.answerCbQuery('Новость не найдена');
    const text = `📰 *${esc(n.title)}*\n\n${esc(n.text)}\n\n🕐 ${new Date(n.createdAt).toLocaleDateString('ru-RU')}`;
    const buttons = [
      [Markup.button.callback('❌ Удалить', `admin:news:delete:${id}`)],
      [Markup.button.callback('⬅ Назад', 'admin:news:list')],
    ];
    if (n.imageUrl) {
      await ctx.editMessageMedia(
        { type: 'photo', media: n.imageUrl, caption: text, parse_mode: 'Markdown' },
        { reply_markup: Markup.inlineKeyboard(buttons).reply_markup }
      );
    } else {
      await ctx.editMessageText(text, { parse_mode: 'Markdown', reply_markup: Markup.inlineKeyboard(buttons).reply_markup });
    }
    return ctx.answerCbQuery();
  }

  if (data.startsWith('admin:news:delete:')) {
    const id = data.split(':')[3];
    removeNews(id);
    await ctx.editMessageText('✅ Новость удалена.', {
      reply_markup: Markup.inlineKeyboard([[Markup.button.callback('⬅ Назад', 'admin:news:list')]]).reply_markup,
    });
    return ctx.answerCbQuery('Новость удалена');
  }

  // Подборки
  if (data === 'admin:collections:list') {
    const cols = listCollections();
    if (!cols.length) {
      return ctx.editMessageText('Подборок нет.', {
        reply_markup: Markup.inlineKeyboard([[Markup.button.callback('⬅ Назад', 'admin:back')]]).reply_markup,
      });
    }
    const buttons = cols.slice(0, 10).map((c) =>
      [Markup.button.callback(`📁 ${c.title.slice(0, 30)}`, `admin:collection:view:${c.id}`)]
    );
    buttons.push([Markup.button.callback('⬅ Назад', 'admin:back')]);
    return ctx.editMessageText('📁 *Подборки*', { parse_mode: 'Markdown', reply_markup: Markup.inlineKeyboard(buttons).reply_markup });
  }

  if (data.startsWith('admin:collection:view:')) {
    const id = data.split(':')[3];
    const c = getCollection(id);
    if (!c) return ctx.answerCbQuery('Не найдено');
    const text = `📁 *${esc(c.title)}*\n\n${c.description ? esc(c.description) + '\n\n' : ''}🎮 Игр: ${c.gameIds.length}\n🆔 \`${c.id}\``;
    const buttons = [
      [Markup.button.callback('❌ Удалить подборку', `admin:collection:delete:${id}`)],
      [Markup.button.callback('⬅ Назад', 'admin:collections:list')],
    ];
    await ctx.editMessageText(text, { parse_mode: 'Markdown', reply_markup: Markup.inlineKeyboard(buttons).reply_markup });
    return ctx.answerCbQuery();
  }

  if (data.startsWith('admin:collection:delete:')) {
    const id = data.split(':')[3];
    removeCollection(id);
    await ctx.editMessageText('✅ Подборка удалена.', {
      reply_markup: Markup.inlineKeyboard([[Markup.button.callback('⬅ Назад', 'admin:collections:list')]]).reply_markup,
    });
    return ctx.answerCbQuery('Подборка удалена');
  }

  // Пользователи
  if (data === 'admin:users') {
    const users = db.users.load();
    const text = `👥 *Пользователи*\n\nВсего: ${users.length}\n\n${users.slice(-10).map((u) => `• \`${u.id}\` ${esc(u.name || '')}`).join('\n')}`;
    return ctx.editMessageText(text, { parse_mode: 'Markdown', reply_markup: Markup.inlineKeyboard([[Markup.button.callback('⬅ Назад', 'admin:back')]]).reply_markup });
  }

  // Рассылка
  if (data === 'admin:broadcast') {
    ctx.reply('Функция рассылки: отправьте /broadcast с текстом.');
    return ctx.answerCbQuery();
  }

  // Назад в админку
  if (data === 'admin:back') {
    return adminPanel(ctx);
  }
}

// Отправка новостей подписчикам
export async function broadcast(ctx) {
  if (!isAdmin(ctx.from.id)) return ctx.reply('Нет доступа');
  const text = ctx.message.text.replace(/^\/broadcast\s*/, '');
  if (!text) return ctx.reply('Отправьте: /broadcast ваш текст');
  const users = db.users.load();
  let sent = 0;
  for (const u of users) {
    try {
      await ctx.telegram.sendMessage(u.id, `📢 *Рассылка:*\n\n${text}`, { parse_mode: 'Markdown' });
      sent++;
    } catch { /* ignore */ }
  }
  ctx.reply(`✅ Рассылка отправлена ${sent}/${users.length} пользователям.`);
}
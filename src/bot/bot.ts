import TelegramBot from 'node-telegram-bot-api'
import { AppDataSource } from '../config/database'
import { User } from '../entities/User'
import { Channel } from '../entities/Channel'
import { Post } from '../entities/Post'
import { grokService } from '../services/grok.service'
import { postsService } from '../services/posts.service'
import { schedulerService } from '../services/scheduler.service'

const token = process.env.TELEGRAM_BOT_TOKEN!

// polling: false — запускается вручную через startBot()
export const bot = new TelegramBot(token, { polling: false })

// ─── State machine ─────────────────────────────────────────────────────────────

type UserStep =
  | { type: 'idle' }
  | { type: 'idea_pick_channel' }
  | { type: 'idea_enter_topic'; channelId: string; channelTitle: string }
  | { type: 'schedule_pick_channel' }
  | { type: 'schedule_pick_draft'; channelId: string; channelTitle: string }
  | { type: 'schedule_enter_time'; postId: string; postPreview: string; channelTitle: string }

const userState = new Map<number, UserStep>()

function getState(telegramId: number): UserStep {
  return userState.get(telegramId) ?? { type: 'idle' }
}
function setState(telegramId: number, step: UserStep): void {
  userState.set(telegramId, step)
}
function clearState(telegramId: number): void {
  userState.set(telegramId, { type: 'idle' })
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

async function findUserByTelegramId(telegramId: number): Promise<User | null> {
  try {
    return await AppDataSource.getRepository(User).findOne({
      where: { telegramId: telegramId.toString() },
    })
  } catch {
    return null
  }
}

async function getUserChannels(userId: string): Promise<Channel[]> {
  return AppDataSource.getRepository(Channel).find({
    where: { user: { id: userId } },
    order: { createdAt: 'ASC' },
  })
}

async function replyNotFound(chatId: number): Promise<void> {
  await bot.sendMessage(
    chatId,
    '❌ Аккаунт не найден.\n\nОткрой NeoPost и войди через Telegram, чтобы привязать аккаунт.',
  )
}

const REQUIRED_CHANNEL = '@neopostchannel'

async function isSubscribed(telegramId: number): Promise<boolean> {
  try {
    const member = await bot.getChatMember(REQUIRED_CHANNEL, telegramId)
    return ['member', 'administrator', 'creator', 'restricted'].includes(member.status)
  } catch {
    // Если канал недоступен — не блокируем
    return true
  }
}

async function requireSubscription(chatId: number, telegramId: number): Promise<boolean> {
  if (await isSubscribed(telegramId)) return true

  await bot.sendMessage(
    chatId,
    `📢 *Подпишись на наш канал!*\n\n` +
    `Чтобы пользоваться ботом NeoPost, необходимо быть подписчиком нашего канала.\n\n` +
    `После подписки нажми кнопку ниже 👇`,
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '📢 Подписаться на NeoPost', url: `https://t.me/${REQUIRED_CHANNEL.slice(1)}` }],
          [{ text: '✅ Я подписался', callback_data: 'check_sub' }],
        ],
      },
    },
  )
  return false
}

function channelKeyboard(channels: Channel[], callbackPrefix: string): TelegramBot.InlineKeyboardButton[][] {
  const rows = channels.map(ch => [
    { text: `📢 ${ch.title}`, callback_data: `${callbackPrefix}:${ch.id}:${ch.title}` },
  ])
  rows.push([{ text: '❌ Отмена', callback_data: 'cancel' }])
  return rows
}

function mainMenuKeyboard(): TelegramBot.InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: '📊 Статистика', callback_data: 'menu:stats' },
        { text: '📝 Черновики', callback_data: 'menu:drafts' },
      ],
      [
        { text: '🗓 Запланированные', callback_data: 'menu:schedule' },
        { text: '💡 Идея поста', callback_data: 'menu:idea' },
      ],
      [
        { text: '📅 Запланировать пост', callback_data: 'menu:schedule_new' },
      ],
    ],
  }
}

// ─── Handlers ──────────────────────────────────────────────────────────────────

async function handleStart(msg: TelegramBot.Message): Promise<void> {
  const telegramId = msg.from?.id
  if (!telegramId) return
  if (!await requireSubscription(msg.chat.id, telegramId)) return

  const name = msg.from?.first_name || 'друг'
  clearState(telegramId)

  await bot.sendMessage(
    msg.chat.id,
    `👋 Привет, *${name}*!\n\n` +
    `Я бот *NeoPost* — помогаю управлять Telegram-каналами прямо из чата.\n\n` +
    `Что умею:\n` +
    `📊 Показывать статистику твоих каналов\n` +
    `📝 Давать доступ к черновикам и публиковать их\n` +
    `🗓 Показывать запланированные посты\n` +
    `💡 Генерировать идеи для постов с помощью AI\n` +
    `📅 Планировать публикацию прямо из бота\n\n` +
    `Выбери, что нужно:`,
    {
      parse_mode: 'Markdown',
      reply_markup: mainMenuKeyboard(),
    },
  )
}

async function handleStats(chatId: number, telegramId: number): Promise<void> {
  const user = await findUserByTelegramId(telegramId)
  if (!user) return replyNotFound(chatId)

  const channels = await getUserChannels(user.id)
  if (channels.length === 0) {
    await bot.sendMessage(chatId, '📭 У тебя пока нет каналов.\n\nДобавь канал в NeoPost и назначь меня администратором.')
    return
  }

  const postRepo = AppDataSource.getRepository(Post)
  const lines: string[] = [`📊 *Статистика NeoPost*\n`]

  for (const channel of channels) {
    const [published, scheduled, drafts, total] = await Promise.all([
      postRepo.count({ where: { channel: { id: channel.id }, status: 'published' } }),
      postRepo.count({ where: { channel: { id: channel.id }, status: 'scheduled' } }),
      postRepo.count({ where: { channel: { id: channel.id }, status: 'draft' } }),
      postRepo.count({ where: { channel: { id: channel.id } } }),
    ])

    const adminBadge = channel.botIsAdmin ? '✅' : '⚠️'
    const username = channel.username ? ` @${channel.username}` : ''

    lines.push(
      `${adminBadge} *${channel.title}*${username}\n` +
      `├ ✅ Опубликовано: *${published}*\n` +
      `├ 🕐 Запланировано: *${scheduled}*\n` +
      `├ 📝 Черновиков: *${drafts}*\n` +
      `└ 📁 Всего постов: *${total}*`,
    )
  }

  if (channels.some(c => !c.botIsAdmin)) {
    lines.push(`\n⚠️ _Каналы без администратора не смогут публиковать посты._`)
  }

  lines.push(`\n_Каналов: ${channels.length}_`)

  await bot.sendMessage(chatId, lines.join('\n\n'), {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: '🔄 Обновить', callback_data: 'menu:stats' }],
        [{ text: '🏠 Главное меню', callback_data: 'menu:home' }],
      ],
    },
  })
}

async function handleDrafts(chatId: number, telegramId: number): Promise<void> {
  const user = await findUserByTelegramId(telegramId)
  if (!user) return replyNotFound(chatId)

  const drafts = await postsService.getPostsByUser(user.id, { status: 'draft' })

  if (drafts.length === 0) {
    await bot.sendMessage(chatId, '📭 Черновиков нет.\n\nСоздай пост в NeoPost.', {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🏠 Главное меню', callback_data: 'menu:home' }],
        ],
      },
    })
    return
  }

  await bot.sendMessage(chatId, `📝 *Черновики — ${drafts.length} шт.*\n\nВыбери пост чтобы опубликовать:`, {
    parse_mode: 'Markdown',
  })

  const shown = drafts.slice(0, 5)
  for (const post of shown) {
    const preview = post.content.length > 200 ? post.content.slice(0, 200) + '…' : post.content
    const channelName = post.channel?.title ?? 'Канал'
    const createdAt = new Date(post.createdAt).toLocaleString('ru-RU', {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
    })

    await bot.sendMessage(
      chatId,
      `📝 *${channelName}*\n_${createdAt}_\n\n${preview}`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '🚀 Опубликовать', callback_data: `publish:${post.id}` },
              { text: '📅 Запланировать', callback_data: `schedule_draft:${post.id}:${post.channel?.title ?? ''}` },
            ],
          ],
        },
      },
    )
  }

  if (drafts.length > 5) {
    await bot.sendMessage(
      chatId,
      `_...и ещё ${drafts.length - 5} черновиков. Все посты — в NeoPost._`,
      { parse_mode: 'Markdown' },
    )
  }

  await bot.sendMessage(chatId, '─', {
    reply_markup: {
      inline_keyboard: [[{ text: '🏠 Главное меню', callback_data: 'menu:home' }]],
    },
  })
}

async function handleScheduleList(chatId: number, telegramId: number): Promise<void> {
  const user = await findUserByTelegramId(telegramId)
  if (!user) return replyNotFound(chatId)

  const allScheduled = await schedulerService.getScheduledPostsByUser(user.id)
  const pending = allScheduled.filter(s => s.status === 'pending')

  if (pending.length === 0) {
    await bot.sendMessage(chatId, '📭 Нет запланированных постов.', {
      reply_markup: {
        inline_keyboard: [
          [{ text: '📅 Запланировать пост', callback_data: 'menu:schedule_new' }],
          [{ text: '🏠 Главное меню', callback_data: 'menu:home' }],
        ],
      },
    })
    return
  }

  const lines: string[] = [`🗓 *Запланировано: ${pending.length}*\n`]

  for (const item of pending.slice(0, 7)) {
    const date = new Date(item.scheduledAt)
    const dateStr = date.toLocaleString('ru-RU', {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
    })
    const preview = item.post.content.length > 80
      ? item.post.content.slice(0, 80) + '…'
      : item.post.content
    const channelName = item.post.channel?.title ?? 'Канал'

    lines.push(`⏰ *${dateStr}* · ${channelName}\n${preview}`)
  }

  if (pending.length > 7) {
    lines.push(`\n_...и ещё ${pending.length - 7}. Все — в NeoPost._`)
  }

  await bot.sendMessage(chatId, lines.join('\n\n'), {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: '📅 Запланировать ещё', callback_data: 'menu:schedule_new' }],
        [{ text: '🔄 Обновить', callback_data: 'menu:schedule' }],
        [{ text: '🏠 Главное меню', callback_data: 'menu:home' }],
      ],
    },
  })
}

async function handleIdeaPickChannel(chatId: number, telegramId: number): Promise<void> {
  const user = await findUserByTelegramId(telegramId)
  if (!user) return replyNotFound(chatId)

  const channels = await getUserChannels(user.id)
  if (channels.length === 0) {
    await bot.sendMessage(chatId, '📭 Нет каналов. Добавь канал в NeoPost.')
    return
  }

  setState(telegramId, { type: 'idea_pick_channel' })

  await bot.sendMessage(chatId, '💡 *Генерация идеи*\n\nДля какого канала генерируем?', {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: channelKeyboard(channels, 'idea_ch') },
  })
}

async function handleIdeaGenerate(chatId: number, telegramId: number, channelTitle: string, topic?: string): Promise<void> {
  await bot.sendChatAction(chatId, 'typing')

  const userPrompt = topic
    ? `Придумай идею для поста в Telegram-канале "${channelTitle}" на тему: "${topic}". Дай заголовок и 2-3 коротких тезиса.`
    : `Предложи 3 разные идеи для постов в Telegram-канале "${channelTitle}". Для каждой — заголовок и 1-2 тезиса. Без лишних слов.`

  try {
    const result = await grokService.rawRequest(
      'Ты помощник для авторов Telegram-каналов. Пиши кратко, по-русски, без markdown-обёрток.',
      userPrompt,
    )
    clearState(telegramId)
    await bot.sendMessage(chatId, `💡 *Идея для "${channelTitle}":*\n\n${result}`, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '🔄 Ещё идеи', callback_data: `idea_ch:${channelTitle}:${channelTitle}` },
            { text: '💡 Другой канал', callback_data: 'menu:idea' },
          ],
          [{ text: '🏠 Главное меню', callback_data: 'menu:home' }],
        ],
      },
    })
  } catch {
    clearState(telegramId)
    await bot.sendMessage(chatId, '❌ Не удалось сгенерировать идею. Попробуй позже.')
  }
}

async function handleScheduleNewPickChannel(chatId: number, telegramId: number): Promise<void> {
  const user = await findUserByTelegramId(telegramId)
  if (!user) return replyNotFound(chatId)

  const channels = await getUserChannels(user.id)
  if (channels.length === 0) {
    await bot.sendMessage(chatId, '📭 Нет каналов. Добавь канал в NeoPost.')
    return
  }

  setState(telegramId, { type: 'schedule_pick_channel' })

  await bot.sendMessage(chatId, '📅 *Запланировать пост*\n\nДля какого канала?', {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: channelKeyboard(channels, 'sched_ch') },
  })
}

async function handleSchedulePickDraft(chatId: number, telegramId: number, channelId: string, channelTitle: string): Promise<void> {
  const user = await findUserByTelegramId(telegramId)
  if (!user) return replyNotFound(chatId)

  setState(telegramId, { type: 'schedule_pick_draft', channelId, channelTitle })

  const drafts = await postsService.getPostsByUser(user.id, { status: 'draft' })
  const channelDrafts = drafts.filter(p => p.channel?.id === channelId)

  if (channelDrafts.length === 0) {
    await bot.sendMessage(chatId,
      `📭 Нет черновиков для канала *${channelTitle}*.\n\nСначала создай пост в NeoPost.`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🏠 Главное меню', callback_data: 'menu:home' }],
          ],
        },
      },
    )
    clearState(telegramId)
    return
  }

  const keyboard = channelDrafts.slice(0, 8).map(p => {
    const title = p.content.slice(0, 40) + (p.content.length > 40 ? '…' : '')
    return [{ text: `📝 ${title}`, callback_data: `sched_post:${p.id}:${channelTitle}` }]
  })
  keyboard.push([{ text: '❌ Отмена', callback_data: 'cancel' }])

  await bot.sendMessage(chatId, `📝 Выбери черновик для публикации в *${channelTitle}*:`, {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: keyboard },
  })
}

// ─── Entry point ───────────────────────────────────────────────────────────────

export function startBot(): void {
  bot.startPolling()

  // /start
  bot.onText(/\/start/, handleStart)

  // Helper — проверить подписку перед выполнением команды
  async function withSub(msg: TelegramBot.Message, fn: (chatId: number, telegramId: number) => Promise<void>): Promise<void> {
    const telegramId = msg.from?.id
    if (!telegramId) return
    if (!await requireSubscription(msg.chat.id, telegramId)) return
    await fn(msg.chat.id, telegramId)
  }

  // /help
  bot.onText(/\/help/, async (msg) => {
    await withSub(msg, async (chatId) => {
      bot.sendMessage(
        chatId,
        `📋 *Команды NeoPost:*\n\n` +
        `/stats — статистика каналов\n` +
        `/drafts — черновики\n` +
        `/schedule — запланированные посты\n` +
        `/idea — сгенерировать идею поста\n` +
        `/new — запланировать публикацию\n` +
        `/help — эта справка`,
        { parse_mode: 'Markdown', reply_markup: mainMenuKeyboard() },
      )
    })
  })

  // /stats
  bot.onText(/\/stats/, msg => withSub(msg, handleStats))

  // /drafts
  bot.onText(/\/drafts/, msg => withSub(msg, handleDrafts))

  // /schedule
  bot.onText(/\/schedule/, msg => withSub(msg, handleScheduleList))

  // /idea
  bot.onText(/\/idea/, msg => withSub(msg, handleIdeaPickChannel))

  // /new — запланировать пост
  bot.onText(/\/new/, msg => withSub(msg, handleScheduleNewPickChannel))

  // ─── Text messages (state machine) ───────────────────────────────────────────

  bot.on('message', async (msg) => {
    const telegramId = msg.from?.id
    const chatId = msg.chat.id
    if (!telegramId || !msg.text || msg.text.startsWith('/')) return

    if (!await requireSubscription(chatId, telegramId)) return

    const state = getState(telegramId)

    // Ожидаем тему для генерации идеи
    if (state.type === 'idea_enter_topic') {
      const topic = msg.text.trim()
      await handleIdeaGenerate(chatId, telegramId, state.channelTitle, topic)
      return
    }

    // Ожидаем дату/время для планирования
    if (state.type === 'schedule_enter_time') {
      const input = msg.text.trim()
      const parsed = parseDateTime(input)

      if (!parsed) {
        await bot.sendMessage(chatId,
          `❌ Не понял формат. Введи дату и время вот так:\n\n` +
          `*25.04 15:30* или *25.04.2025 15:30*`,
          { parse_mode: 'Markdown' },
        )
        return
      }

      if (parsed.getTime() <= Date.now()) {
        await bot.sendMessage(chatId, '❌ Время должно быть в будущем. Попробуй ещё раз.')
        return
      }

      const user = await findUserByTelegramId(telegramId)
      if (!user) return replyNotFound(chatId)

      try {
        await schedulerService.schedulePost({ postId: state.postId, scheduledAt: parsed, userId: user.id })
        clearState(telegramId)

        const dateStr = parsed.toLocaleString('ru-RU', {
          day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit',
        })

        await bot.sendMessage(chatId,
          `✅ *Пост запланирован!*\n\n` +
          `📢 Канал: ${state.channelTitle}\n` +
          `📝 Пост: ${state.postPreview}\n` +
          `⏰ Время: *${dateStr}*`,
          {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: '🗓 Посмотреть расписание', callback_data: 'menu:schedule' }],
                [{ text: '🏠 Главное меню', callback_data: 'menu:home' }],
              ],
            },
          },
        )
      } catch (err: unknown) {
        clearState(telegramId)
        const message = err instanceof Error ? err.message : 'Неизвестная ошибка'
        await bot.sendMessage(chatId, `❌ Ошибка: ${message}`)
      }
      return
    }
  })

  // ─── Callback query ───────────────────────────────────────────────────────────

  bot.on('callback_query', async (query) => {
    const chatId = query.message?.chat.id
    const messageId = query.message?.message_id
    const telegramId = query.from.id
    const data = query.data

    if (!chatId || !data) return
    await bot.answerCallbackQuery(query.id)

    // ── Проверка подписки ──
    if (data === 'check_sub') {
      if (await isSubscribed(telegramId)) {
        await bot.sendMessage(chatId,
          '✅ Отлично! Ты подписан. Добро пожаловать в NeoPost! 🎉',
          { reply_markup: mainMenuKeyboard() },
        )
      } else {
        await bot.answerCallbackQuery(query.id, {
          text: '❌ Ты ещё не подписан. Подпишись и попробуй снова.',
          show_alert: true,
        })
      }
      return
    }

    // Для всех остальных кнопок — тоже проверяем подписку
    if (!await requireSubscription(chatId, telegramId)) return

    // ── Главное меню ──
    if (data === 'menu:home') {
      clearState(telegramId)
      await bot.sendMessage(chatId, '🏠 *Главное меню*\n\nЧто нужно сделать?', {
        parse_mode: 'Markdown',
        reply_markup: mainMenuKeyboard(),
      })
      return
    }

    if (data === 'menu:stats') { await handleStats(chatId, telegramId); return }
    if (data === 'menu:drafts') { await handleDrafts(chatId, telegramId); return }
    if (data === 'menu:schedule') { await handleScheduleList(chatId, telegramId); return }
    if (data === 'menu:idea') { await handleIdeaPickChannel(chatId, telegramId); return }
    if (data === 'menu:schedule_new') { await handleScheduleNewPickChannel(chatId, telegramId); return }

    // ── Отмена ──
    if (data === 'cancel') {
      clearState(telegramId)
      await bot.sendMessage(chatId, '↩️ Отменено.', {
        reply_markup: { inline_keyboard: [[{ text: '🏠 Главное меню', callback_data: 'menu:home' }]] },
      })
      return
    }

    // ── Выбор канала для идеи: idea_ch:{channelId}:{channelTitle} ──
    if (data.startsWith('idea_ch:')) {
      const parts = data.split(':')
      const channelId = parts[1]
      const channelTitle = parts.slice(2).join(':')

      setState(telegramId, { type: 'idea_enter_topic', channelId, channelTitle })

      await bot.sendMessage(chatId,
        `💡 Канал: *${channelTitle}*\n\nНапиши тему поста или отправь /skip, чтобы получить 3 случайные идеи:`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🎲 Случайные идеи', callback_data: `idea_gen:${channelId}:${channelTitle}` }],
              [{ text: '❌ Отмена', callback_data: 'cancel' }],
            ],
          },
        },
      )
      return
    }

    // ── Генерировать без темы: idea_gen:{channelId}:{channelTitle} ──
    if (data.startsWith('idea_gen:')) {
      const parts = data.split(':')
      const channelTitle = parts.slice(2).join(':')
      clearState(telegramId)
      await handleIdeaGenerate(chatId, telegramId, channelTitle)
      return
    }

    // ── Выбор канала для планирования: sched_ch:{channelId}:{channelTitle} ──
    if (data.startsWith('sched_ch:')) {
      const parts = data.split(':')
      const channelId = parts[1]
      const channelTitle = parts.slice(2).join(':')
      await handleSchedulePickDraft(chatId, telegramId, channelId, channelTitle)
      return
    }

    // ── Выбор черновика для планирования: sched_post:{postId}:{channelTitle} ──
    if (data.startsWith('sched_post:')) {
      const parts = data.split(':')
      const postId = parts[1]
      const channelTitle = parts.slice(2).join(':')

      const post = await AppDataSource.getRepository(Post).findOne({ where: { id: postId } })
      const preview = post ? post.content.slice(0, 60) + (post.content.length > 60 ? '…' : '') : ''

      setState(telegramId, { type: 'schedule_enter_time', postId, postPreview: preview, channelTitle })

      await bot.sendMessage(chatId,
        `⏰ *Выбери время публикации*\n\n` +
        `Канал: *${channelTitle}*\n` +
        `Пост: _${preview}_\n\n` +
        `Введи дату и время в формате:\n*25.04 15:30* или *25.04.2025 15:30*`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [[{ text: '❌ Отмена', callback_data: 'cancel' }]],
          },
        },
      )
      return
    }

    // ── Запланировать черновик из /drafts: schedule_draft:{postId}:{channelTitle} ──
    if (data.startsWith('schedule_draft:')) {
      const parts = data.split(':')
      const postId = parts[1]
      const channelTitle = parts.slice(2).join(':')

      const post = await AppDataSource.getRepository(Post).findOne({ where: { id: postId } })
      const preview = post ? post.content.slice(0, 60) + (post.content.length > 60 ? '…' : '') : ''

      setState(telegramId, { type: 'schedule_enter_time', postId, postPreview: preview, channelTitle })

      await bot.sendMessage(chatId,
        `⏰ Введи дату и время для публикации:\n\n*25.04 15:30* или *25.04.2025 15:30*`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [[{ text: '❌ Отмена', callback_data: 'cancel' }]],
          },
        },
      )
      return
    }

    // ── Голосование ──
    if (data.startsWith('vote:')) {
      const buttonId = data.slice('vote:'.length)
      const postRepo = AppDataSource.getRepository(Post)

      const post = await postRepo
        .createQueryBuilder('p')
        .where('p.buttons @> :btn', { btn: JSON.stringify([{ id: buttonId }]) })
        .getOne()

      if (!post?.buttons) {
        await bot.answerCallbackQuery(query.id, { text: '❌ Кнопка не найдена' })
        return
      }

      const btn = post.buttons.find(b => b.id === buttonId)
      if (!btn) {
        await bot.answerCallbackQuery(query.id, { text: '❌ Кнопка не найдена' })
        return
      }

      btn.clickCount += 1
      await postRepo.save(post)
      await bot.answerCallbackQuery(query.id, { text: '✅ Голос учтён!' })
      return
    }

    // ── Публикация черновика ──
    if (data.startsWith('publish:')) {
      const postId = data.slice('publish:'.length)
      const user = await findUserByTelegramId(telegramId)

      if (!user) {
        await bot.answerCallbackQuery(query.id, { text: '❌ Пользователь не найден' })
        return
      }

      try {
        await postsService.publishPost(postId, user.id)
        await bot.answerCallbackQuery(query.id, { text: '✅ Опубликовано!' })
        if (messageId) {
          await bot.editMessageReplyMarkup(
            { inline_keyboard: [[{ text: '✅ Опубликовано', callback_data: 'noop' }]] },
            { chat_id: chatId, message_id: messageId },
          )
        }
      } catch {
        await bot.answerCallbackQuery(query.id, { text: '❌ Ошибка. Попробуй в NeoPost.' })
      }
      return
    }
  })

  bot.on('polling_error', (err) => {
    console.error('[BOT] Polling error:', err.message)
  })

  console.log('[BOT] Telegram bot started')
}

// ─── Utils ─────────────────────────────────────────────────────────────────────

function parseDateTime(input: string): Date | null {
  // Форматы: "25.04 15:30" | "25.04.2025 15:30" | "25.04.25 15:30"
  const match = input.match(/^(\d{1,2})\.(\d{2})(?:\.(\d{2,4}))?\s+(\d{1,2}):(\d{2})$/)
  if (!match) return null

  const day = parseInt(match[1], 10)
  const month = parseInt(match[2], 10) - 1
  const yearRaw = match[3]
  const hour = parseInt(match[4], 10)
  const minute = parseInt(match[5], 10)

  let year: number
  if (!yearRaw) {
    year = new Date().getFullYear()
  } else if (yearRaw.length <= 2) {
    year = 2000 + parseInt(yearRaw, 10)
  } else {
    year = parseInt(yearRaw, 10)
  }

  const date = new Date(year, month, day, hour, minute)
  if (isNaN(date.getTime())) return null
  return date
}

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

async function findUserByTelegramId(telegramId: number): Promise<User | null> {
  try {
    return await AppDataSource.getRepository(User).findOne({
      where: { telegramId: telegramId.toString() },
    })
  } catch {
    return null
  }
}

async function replyNotFound(chatId: number): Promise<void> {
  await bot.sendMessage(
    chatId,
    '❌ Аккаунт не найден.\n\nОткрой NeoPost и войди через Telegram, чтобы привязать аккаунт.',
  )
}

export function startBot(): void {
  bot.startPolling({
    params: {
      allowed_updates: ['message', 'callback_query'] as any,
    },
  })

  // /start
  bot.onText(/\/start/, (msg) => {
    const name = msg.from?.first_name || 'друг'
    bot.sendMessage(
      msg.chat.id,
      `Привет, ${name}! 👋\n\nЯ бот NeoPost. Добавь меня в свой Telegram-канал как администратора, и я смогу публиковать посты через платформу NeoPost.\n\n📌 После добавления зарегистрируй канал в личном кабинете.\n\n/help — список команд`,
    )
  })

  // /help
  bot.onText(/\/help/, (msg) => {
    bot.sendMessage(
      msg.chat.id,
      `📋 *Команды NeoPost:*\n\n` +
        `/idea [тема] — сгенерировать идею поста\n` +
        `/stats — статистика твоих каналов\n` +
        `/drafts — черновики (можно сразу опубликовать)\n` +
        `/schedule — запланированные посты\n` +
        `/help — эта справка`,
      { parse_mode: 'Markdown' },
    )
  })

  // /idea [тема]
  bot.onText(/\/idea(?:\s+([\s\S]+))?$/, async (msg, match) => {
    const chatId = msg.chat.id
    const telegramId = msg.from?.id
    if (!telegramId) return

    const user = await findUserByTelegramId(telegramId)
    if (!user) return replyNotFound(chatId)

    const topic = match?.[1]?.trim()
    const userPrompt = topic
      ? `Придумай идею для поста в Telegram-канале на тему: "${topic}". Дай заголовок и 2-3 коротких тезиса. Без лишних слов.`
      : `Предложи 3 разные идеи для постов в Telegram-канале. Для каждой — заголовок и 1-2 тезиса. Без лишних слов.`

    await bot.sendChatAction(chatId, 'typing')

    try {
      const result = await grokService.rawRequest(
        'Ты помощник для авторов Telegram-каналов. Пиши кратко, по-русски, без markdown-обёрток.',
        userPrompt,
      )
      await bot.sendMessage(chatId, `💡 *Идея поста:*\n\n${result}`, { parse_mode: 'Markdown' })
    } catch {
      await bot.sendMessage(chatId, '❌ Не удалось сгенерировать идею. Попробуй позже.')
    }
  })

  // /stats
  bot.onText(/\/stats/, async (msg) => {
    const chatId = msg.chat.id
    const telegramId = msg.from?.id
    if (!telegramId) return

    const user = await findUserByTelegramId(telegramId)
    if (!user) return replyNotFound(chatId)

    const channels = await AppDataSource.getRepository(Channel).find({
      where: { user: { id: user.id } },
    })

    if (channels.length === 0) {
      return bot.sendMessage(chatId, '📭 У тебя пока нет каналов. Добавь канал в NeoPost.')
    }

    const postRepo = AppDataSource.getRepository(Post)
    const lines: string[] = [`📊 *Статистика NeoPost*\n`]

    for (const channel of channels) {
      const [published, scheduled, drafts] = await Promise.all([
        postRepo.count({ where: { channel: { id: channel.id }, status: 'published' } }),
        postRepo.count({ where: { channel: { id: channel.id }, status: 'scheduled' } }),
        postRepo.count({ where: { channel: { id: channel.id }, status: 'draft' } }),
      ])

      lines.push(
        `📢 *${channel.title}*\n` +
          `  ✅ Опубликовано: ${published}\n` +
          `  🕐 Запланировано: ${scheduled}\n` +
          `  📝 Черновиков: ${drafts}`,
      )
    }

    await bot.sendMessage(chatId, lines.join('\n\n'), { parse_mode: 'Markdown' })
  })

  // /drafts
  bot.onText(/\/drafts/, async (msg) => {
    const chatId = msg.chat.id
    const telegramId = msg.from?.id
    if (!telegramId) return

    const user = await findUserByTelegramId(telegramId)
    if (!user) return replyNotFound(chatId)

    const drafts = await postsService.getPostsByUser(user.id, { status: 'draft' })

    if (drafts.length === 0) {
      return bot.sendMessage(chatId, '📭 Черновиков нет. Создай пост в NeoPost.')
    }

    const shown = drafts.slice(0, 5)

    for (const post of shown) {
      const preview = post.content.length > 200 ? post.content.slice(0, 200) + '…' : post.content
      const channelName = post.channel?.title ?? 'Канал'

      await bot.sendMessage(
        chatId,
        `📝 *Черновик* · ${channelName}\n\n${preview}`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🚀 Опубликовать сейчас', callback_data: `publish:${post.id}` }],
            ],
          },
        },
      )
    }

    if (drafts.length > 5) {
      await bot.sendMessage(
        chatId,
        `_...и ещё ${drafts.length - 5} черновиков. Открой NeoPost, чтобы увидеть все._`,
        { parse_mode: 'Markdown' },
      )
    }
  })

  // /schedule
  bot.onText(/\/schedule/, async (msg) => {
    const chatId = msg.chat.id
    const telegramId = msg.from?.id
    if (!telegramId) return

    const user = await findUserByTelegramId(telegramId)
    if (!user) return replyNotFound(chatId)

    const allScheduled = await schedulerService.getScheduledPostsByUser(user.id)
    const pending = allScheduled.filter((s) => s.status === 'pending')

    if (pending.length === 0) {
      return bot.sendMessage(chatId, '📭 Нет запланированных постов. Создай их в NeoPost.')
    }

    const lines: string[] = [`🗓 *Запланировано постов: ${pending.length}*\n`]

    for (const item of pending.slice(0, 7)) {
      const date = new Date(item.scheduledAt)
      const dateStr = date.toLocaleString('ru-RU', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
      const preview =
        item.post.content.length > 60 ? item.post.content.slice(0, 60) + '…' : item.post.content
      const channelName = item.post.channel?.title ?? 'Канал'

      lines.push(`⏰ *${dateStr}* · ${channelName}\n${preview}`)
    }

    if (pending.length > 7) {
      lines.push(`\n_...и ещё ${pending.length - 7}. Все посты — в NeoPost._`)
    }

    await bot.sendMessage(chatId, lines.join('\n\n'), { parse_mode: 'Markdown' })
  })

  // Обработка кнопки "Опубликовать" из /drafts
  bot.on('callback_query', async (query) => {
    const chatId = query.message?.chat.id
    const messageId = query.message?.message_id
    const telegramId = query.from.id
    const data = query.data

    if (!chatId || !data) return

    if (data.startsWith('vote:')) {
      const buttonId = data.slice('vote:'.length)
      const postRepo = AppDataSource.getRepository(Post)

      const post = await postRepo
        .createQueryBuilder('p')
        .where('p.buttons @> :btn', { btn: JSON.stringify([{ id: buttonId }]) })
        .getOne()

      if (!post || !post.buttons) {
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
        // убираем кнопки после публикации
        if (messageId) {
          await bot.editMessageReplyMarkup(
            { inline_keyboard: [] },
            { chat_id: chatId, message_id: messageId },
          )
        }
      } catch {
        await bot.answerCallbackQuery(query.id, { text: '❌ Ошибка публикации. Попробуй в NeoPost.' })
      }
    }
  })

  bot.on('polling_error', (err) => {
    console.error('[BOT] Polling error:', err.message)
  })

  console.log('[BOT] Telegram bot started')
}

/**
 * Audit Bot — мониторинг сервера и проекта через inline-кнопки.
 * Env vars: AUDIT_BOT_TOKEN, AUDIT_CHAT_ID
 */

import os from 'os'
import TelegramBot from 'node-telegram-bot-api'
import { AppDataSource } from '../config/database'
import { User } from '../entities/User'
import { Channel } from '../entities/Channel'
import { Post } from '../entities/Post'
import { UserSubscription } from '../entities/UserSubscription'
import { UsageLog } from '../entities/UsageLog'
import { Payment } from '../entities/Payment'

function getToken(): string  { return process.env.AUDIT_BOT_TOKEN ?? '' }
function getChatId(): string { return process.env.AUDIT_CHAT_ID   ?? '' }
function isConfigured(): boolean { return !!(getToken() && getChatId()) }
function isOwner(chatId: number | string): boolean { return String(chatId) === getChatId() }

// ─── Секции данных ────────────────────────────────────────────────────────────

async function buildUsersSection(): Promise<string> {
  const now        = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const weekStart  = new Date(todayStart); weekStart.setDate(weekStart.getDate() - 7)
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

  const repo = AppDataSource.getRepository(User)
  const [total, today, week, month] = await Promise.all([
    repo.count(),
    repo.createQueryBuilder('u').where('u.createdAt >= :d', { d: todayStart }).getCount(),
    repo.createQueryBuilder('u').where('u.createdAt >= :d', { d: weekStart }).getCount(),
    repo.createQueryBuilder('u').where('u.createdAt >= :d', { d: monthStart }).getCount(),
  ])

  const tgUsers = await repo.createQueryBuilder('u')
    .where('u.telegramId IS NOT NULL').getCount()

  return (
    `👥 <b>Пользователи</b>\n\n` +
    `Всего: <b>${total}</b>\n` +
    `  • Через Telegram: ${tgUsers}\n` +
    `  • Через Email: ${total - tgUsers}\n\n` +
    `Прирост:\n` +
    `  • Сегодня: <b>+${today}</b>\n` +
    `  • За неделю: <b>+${week}</b>\n` +
    `  • За месяц: <b>+${month}</b>`
  )
}

async function buildPlansSection(): Promise<string> {
  const now   = new Date()
  const subRepo = AppDataSource.getRepository(UserSubscription)

  const planRows = await subRepo
    .createQueryBuilder('s')
    .select('s.plan', 'plan')
    .addSelect('COUNT(*)', 'count')
    .groupBy('s.plan')
    .getRawMany<{ plan: string; count: string }>()

  const plans: Record<string, number> = { free: 0, start: 0, pro: 0, max: 0 }
  for (const r of planRows) plans[r.plan] = parseInt(r.count)

  const trials = await subRepo.createQueryBuilder('s')
    .where('s.trialEndsAt > :now', { now }).getCount()

  const paid = plans.start + plans.pro + plans.max
  const total = paid + plans.free

  return (
    `📋 <b>Подписки</b>\n\n` +
    `🆓 Free: <b>${plans.free}</b>\n` +
    `🚀 Старт: <b>${plans.start}</b>\n` +
    `⚡️ Про: <b>${plans.pro}</b>\n` +
    `💎 Макс: <b>${plans.max}</b>\n` +
    `🎁 На триале: <b>${trials}</b>\n\n` +
    `Платных: <b>${paid}</b> из ${total} (${total > 0 ? Math.round(paid / total * 100) : 0}%)`
  )
}

async function buildRevenueSection(): Promise<string> {
  const now        = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const prevStart  = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const prevEnd    = new Date(now.getFullYear(), now.getMonth(), 1)
  const yearStart  = new Date(now.getFullYear(), 0, 1)

  const repo = AppDataSource.getRepository(Payment)

  const query = (from: Date, to?: Date) => {
    const q = repo.createQueryBuilder('p')
      .select('SUM(p.amount)', 'total')
      .addSelect('COUNT(*)', 'count')
      .where('p.status = :s', { s: 'succeeded' })
      .andWhere('p.createdAt >= :from', { from })
    if (to) q.andWhere('p.createdAt < :to', { to })
    return q.getRawOne<{ total: string; count: string }>()
  }

  const [month, prev, year, all] = await Promise.all([
    query(monthStart),
    query(prevStart, prevEnd),
    query(yearStart),
    query(new Date(0)),
  ])

  const toRub = (v: string | null) => (parseInt(v ?? '0') || 0).toLocaleString('ru-RU')
  const monthRub = parseInt(month?.total ?? '0') || 0
  const prevRub  = parseInt(prev?.total  ?? '0') || 0
  const diff = monthRub - prevRub
  const diffStr = diff >= 0 ? `+${diff.toLocaleString('ru-RU')} ₽` : `${diff.toLocaleString('ru-RU')} ₽`

  return (
    `💰 <b>Выручка</b>\n\n` +
    `Этот месяц: <b>${toRub(month?.total ?? null)} ₽</b>\n` +
    `  Платежей: ${month?.count ?? 0}\n` +
    `  vs прошлый: ${diffStr}\n\n` +
    `Прошлый месяц: <b>${toRub(prev?.total ?? null)} ₽</b>\n` +
    `За год: <b>${toRub(year?.total ?? null)} ₽</b>\n` +
    `Всего за всё время: <b>${toRub(all?.total ?? null)} ₽</b>`
  )
}

async function buildActivitySection(): Promise<string> {
  const now          = new Date()
  const monthStart   = new Date(now.getFullYear(), now.getMonth(), 1)
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  const [totalChannels, totalPosts, publishedPosts, scheduledPosts, aiMonth] = await Promise.all([
    AppDataSource.getRepository(Channel).count(),
    AppDataSource.getRepository(Post).count(),
    AppDataSource.getRepository(Post).count({ where: { status: 'published' } }),
    AppDataSource.getRepository(Post).count({ where: { status: 'scheduled' } }),
    AppDataSource.getRepository(UsageLog)
      .createQueryBuilder('u')
      .select('SUM(u.aiGenerations)', 'total')
      .where('u.month = :m', { m: currentMonth })
      .getRawOne<{ total: string }>()
      .then(r => parseInt(r?.total ?? '0') || 0),
  ])

  const postsMonth = await AppDataSource.getRepository(Post)
    .createQueryBuilder('p')
    .where('p.createdAt >= :d', { d: monthStart })
    .getCount()

  return (
    `📢 <b>Активность</b>\n\n` +
    `Каналов: <b>${totalChannels}</b>\n\n` +
    `Постов всего: <b>${totalPosts}</b>\n` +
    `  • Опубликовано: ${publishedPosts}\n` +
    `  • Запланировано: ${scheduledPosts}\n` +
    `  • Создано за месяц: ${postsMonth}\n\n` +
    `🤖 AI-генераций за месяц: <b>${aiMonth}</b>`
  )
}

function buildServerSection(): string {
  const totalMem  = os.totalmem()
  const freeMem   = os.freemem()
  const usedMem   = totalMem - freeMem
  const memPct    = Math.round(usedMem / totalMem * 100)
  const uptimeSec = os.uptime()
  const days      = Math.floor(uptimeSec / 86400)
  const hours     = Math.floor((uptimeSec % 86400) / 3600)
  const mins      = Math.floor((uptimeSec % 3600) / 60)

  const loadAvg   = os.loadavg()
  const cpus      = os.cpus().length
  const load1     = loadAvg[0].toFixed(2)
  const load5     = loadAvg[1].toFixed(2)

  const toMb = (b: number) => (b / 1024 / 1024).toFixed(0)

  const procMem   = process.memoryUsage()
  const heapUsed  = (procMem.heapUsed / 1024 / 1024).toFixed(1)
  const rss       = (procMem.rss / 1024 / 1024).toFixed(1)

  return (
    `🖥️ <b>Сервер</b>\n\n` +
    `💾 Память: <b>${toMb(usedMem)} / ${toMb(totalMem)} MB</b> (${memPct}%)\n` +
    `   Node.js heap: ${heapUsed} MB | RSS: ${rss} MB\n\n` +
    `⚙️ CPU: ${cpus} ядер | load: ${load1} / ${load5}\n\n` +
    `⏱ Uptime ОС: ${days}д ${hours}ч ${mins}м\n` +
    `⏱ Uptime Node: ${Math.floor(process.uptime() / 3600)}ч ${Math.floor(process.uptime() % 3600 / 60)}м\n\n` +
    `🌍 Node.js ${process.version}\n` +
    `📅 ${new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })} МСК`
  )
}

// ─── Клавиатура ───────────────────────────────────────────────────────────────

const mainKeyboard: TelegramBot.InlineKeyboardMarkup = {
  inline_keyboard: [
    [
      { text: '👥 Пользователи', callback_data: 'users' },
      { text: '📋 Подписки',     callback_data: 'plans' },
    ],
    [
      { text: '💰 Выручка',      callback_data: 'revenue' },
      { text: '📢 Активность',   callback_data: 'activity' },
    ],
    [
      { text: '🖥️ Сервер',       callback_data: 'server' },
      { text: '🔄 Всё сразу',    callback_data: 'all' },
    ],
  ],
}

const backKeyboard: TelegramBot.InlineKeyboardMarkup = {
  inline_keyboard: [[
    { text: '◀️ Назад', callback_data: 'back' },
    { text: '🔄 Обновить', callback_data: 'refresh_current' },
  ]],
}

// ─── Утилиты отправки ────────────────────────────────────────────────────────

async function send(text: string): Promise<void> {
  if (!isConfigured()) return
  try {
    await fetch(`https://api.telegram.org/bot${getToken()}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: getChatId(), text, parse_mode: 'HTML' }),
    })
  } catch (err) {
    console.error('[AUDIT] sendMessage failed:', err)
  }
}

// ─── Сервис ───────────────────────────────────────────────────────────────────

class AuditService {
  private bot: TelegramBot | null = null
  private lastCallback: Record<number, string> = {} // chatId → last section

  async startPolling(): Promise<void> {
    if (!isConfigured()) return

    try {
      await fetch(`https://api.telegram.org/bot${getToken()}/deleteWebhook?drop_pending_updates=true`)
    } catch { /* ignore */ }

    this.bot = new TelegramBot(getToken(), { polling: { interval: 2000 } })

    // /start — главное меню
    this.bot.onText(/\/start/, async (msg) => {
      if (!isOwner(msg.chat.id)) return
      await this.bot!.sendMessage(
        msg.chat.id,
        `🚀 <b>NeoPost Dashboard</b>\n\nВыбери раздел:`,
        { parse_mode: 'HTML', reply_markup: mainKeyboard },
      ).catch(() => {})
    })

    // Inline callback
    this.bot.on('callback_query', async (query) => {
      if (!isOwner(query.message?.chat.id ?? 0)) return

      const chatId  = query.message!.chat.id
      const msgId   = query.message!.message_id
      const data    = query.data ?? ''

      await this.bot!.answerCallbackQuery(query.id, { text: '⏳ Загружаю...' }).catch(() => {})

      try {
        if (data === 'back') {
          await this.bot!.editMessageText(
            `🚀 <b>NeoPost Dashboard</b>\n\nВыбери раздел:`,
            { chat_id: chatId, message_id: msgId, parse_mode: 'HTML', reply_markup: mainKeyboard },
          ).catch(() => {})
          return
        }

        if (data === 'refresh_current') {
          const section = this.lastCallback[chatId] ?? 'all'
          await this.sendSection(chatId, msgId, section)
          return
        }

        this.lastCallback[chatId] = data
        await this.sendSection(chatId, msgId, data)

      } catch (err) {
        console.error('[AUDIT] callback error:', err)
        await this.bot!.answerCallbackQuery(query.id, { text: '❌ Ошибка' }).catch(() => {})
      }
    })

    this.bot.on('polling_error', (err: Error) => {
      if (!err.message.includes('409')) {
        console.error('[AUDIT BOT] Polling error:', err.message)
      }
    })

    const stop = async () => { await this.bot?.stopPolling().catch(() => {}) }
    process.once('SIGTERM', stop)
    process.once('SIGINT', stop)

    console.log('[AUDIT BOT] Started')
  }

  private async sendSection(chatId: number, msgId: number, section: string): Promise<void> {
    let text = ''

    if (section === 'all') {
      const [u, p, r, a] = await Promise.all([
        buildUsersSection(),
        buildPlansSection(),
        buildRevenueSection(),
        buildActivitySection(),
      ])
      text = [u, p, r, a, buildServerSection()].join('\n\n─────────────────\n\n')
    } else if (section === 'users')    { text = await buildUsersSection()   }
    else if (section === 'plans')      { text = await buildPlansSection()   }
    else if (section === 'revenue')    { text = await buildRevenueSection() }
    else if (section === 'activity')   { text = await buildActivitySection() }
    else if (section === 'server')     { text = buildServerSection()        }

    await this.bot!.editMessageText(text, {
      chat_id: chatId,
      message_id: msgId,
      parse_mode: 'HTML',
      reply_markup: backKeyboard,
    }).catch(() => {})
  }

  // ─── Уведомления ─────────────────────────────────────────────────────────

  notifyNewUser(user: {
    id: string
    email: string | null
    username: string | null
    firstName: string
    via: 'email' | 'telegram'
  }): void {
    const who = user.email
      ? `📧 <b>${user.firstName}</b> (${user.email})`
      : `✈️ <b>${user.firstName}</b>${user.username ? ` @${user.username}` : ''}`

    send(
      `👤 <b>Новый пользователь</b>\n` +
      `${who}\n` +
      `Вход: ${user.via === 'email' ? 'Email' : 'Telegram'}\n` +
      `ID: <code>${user.id}</code>`,
    ).catch(() => {})
  }

  notifyNewPayment(info: {
    userId: string
    email: string | null
    firstName: string
    plan: string
    months: number
    amount: number
  }): void {
    const planNames: Record<string, string> = { start: 'Старт', pro: 'Про', max: 'Максимум' }
    send(
      `💰 <b>Новая оплата</b>\n` +
      `👤 ${info.firstName}${info.email ? ` (${info.email})` : ''}\n` +
      `📦 Тариф: <b>${planNames[info.plan] ?? info.plan}</b> на ${info.months} мес.\n` +
      `💵 Сумма: <b>${info.amount} ₽</b>\n` +
      `ID: <code>${info.userId}</code>`,
    ).catch(() => {})
  }
}

export const auditService = new AuditService()

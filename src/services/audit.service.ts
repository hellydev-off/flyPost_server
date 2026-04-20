/**
 * Audit Bot — полный мониторинг NeoPost через Telegram.
 * Команды: /start /stats /users /plans /revenue /activity /server /help
 * Env: AUDIT_BOT_TOKEN, AUDIT_CHAT_ID
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getToken(): string  { return process.env.AUDIT_BOT_TOKEN ?? '' }
function getChatId(): string { return process.env.AUDIT_CHAT_ID   ?? '' }
function isConfigured(): boolean { return !!(getToken() && getChatId()) }
function isOwner(id: number | string): boolean { return String(id) === getChatId() }

function bar(value: number, max: number, len = 10): string {
  const filled = max > 0 ? Math.round((value / max) * len) : 0
  return '█'.repeat(filled) + '░'.repeat(len - filled)
}

function pct(value: number, total: number): string {
  return total > 0 ? `${Math.round(value / total * 100)}%` : '0%'
}

function trend(current: number, prev: number): string {
  if (current > prev) return '↑'
  if (current < prev) return '↓'
  return '→'
}

function rub(value: number): string {
  return value.toLocaleString('ru-RU') + ' ₽'
}

function mb(bytes: number): string {
  return (bytes / 1024 / 1024).toFixed(0) + ' MB'
}

function now(): string {
  return new Date().toLocaleString('ru-RU', {
    timeZone: 'Europe/Moscow',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }) + ' МСК'
}

// ─── Разделы ─────────────────────────────────────────────────────────────────

async function sectionUsers(): Promise<string> {
  const repo       = AppDataSource.getRepository(User)
  const n          = new Date()
  const todayStart = new Date(n.getFullYear(), n.getMonth(), n.getDate())
  const weekStart  = new Date(todayStart); weekStart.setDate(weekStart.getDate() - 7)
  const monthStart = new Date(n.getFullYear(), n.getMonth(), 1)
  const prevMonth  = new Date(n.getFullYear(), n.getMonth() - 1, 1)
  const prevMonthEnd = new Date(n.getFullYear(), n.getMonth(), 1)

  const [total, today, week, month, prevMonthCount, tg, email] = await Promise.all([
    repo.count(),
    repo.createQueryBuilder('u').where('u.createdAt >= :d', { d: todayStart }).getCount(),
    repo.createQueryBuilder('u').where('u.createdAt >= :d', { d: weekStart }).getCount(),
    repo.createQueryBuilder('u').where('u.createdAt >= :d', { d: monthStart }).getCount(),
    repo.createQueryBuilder('u')
      .where('u.createdAt >= :a', { a: prevMonth })
      .andWhere('u.createdAt < :b', { b: prevMonthEnd })
      .getCount(),
    repo.createQueryBuilder('u').where('u.telegramId IS NOT NULL').getCount(),
    repo.createQueryBuilder('u').where('u.email IS NOT NULL').getCount(),
  ])

  const trendMonth = trend(month, prevMonthCount)

  return (
    `👥 <b>ПОЛЬЗОВАТЕЛИ</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━\n\n` +

    `📊 Всего зарегистрировано: <b>${total}</b>\n\n` +

    `📥 Прирост:\n` +
    `  Сегодня:    <b>+${today}</b>\n` +
    `  Неделя:     <b>+${week}</b>\n` +
    `  Месяц:      <b>+${month}</b> ${trendMonth} (пред. +${prevMonthCount})\n\n` +

    `🔗 Способ входа:\n` +
    `  Telegram: ${tg}  ${bar(tg, total)}  ${pct(tg, total)}\n` +
    `  Email:    ${email}  ${bar(email, total)}  ${pct(email, total)}\n\n` +

    `🕐 <i>${now()}</i>`
  )
}

async function sectionPlans(): Promise<string> {
  const subRepo = AppDataSource.getRepository(UserSubscription)
  const userRepo = AppDataSource.getRepository(User)
  const n = new Date()

  const planRows = await subRepo
    .createQueryBuilder('s')
    .select('s.plan', 'plan')
    .addSelect('COUNT(*)', 'count')
    .groupBy('s.plan')
    .getRawMany<{ plan: string; count: string }>()

  const plans: Record<string, number> = { free: 0, start: 0, pro: 0, max: 0 }
  for (const r of planRows) plans[r.plan] = parseInt(r.count)

  const [trials, expiringSoon] = await Promise.all([
    subRepo.createQueryBuilder('s').where('s.trialEndsAt > :now', { now: n }).getCount(),
    subRepo.createQueryBuilder('s')
      .where('s.endsAt > :now', { now: n })
      .andWhere('s.endsAt < :soon', { soon: new Date(n.getTime() + 7 * 86400 * 1000) })
      .andWhere('s.plan != :p', { p: 'free' })
      .getCount(),
  ])

  const total  = await userRepo.count()
  const paid   = plans.start + plans.pro + plans.max
  const convPct = total > 0 ? ((paid / total) * 100).toFixed(1) : '0'

  return (
    `📋 <b>ПОДПИСКИ</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━\n\n` +

    `🆓 Free:   <b>${plans.free}</b>  ${bar(plans.free, total)}\n` +
    `🚀 Старт:  <b>${plans.start}</b>  ${bar(plans.start, total)}\n` +
    `⚡ Про:    <b>${plans.pro}</b>  ${bar(plans.pro, total)}\n` +
    `💎 Макс:   <b>${plans.max}</b>  ${bar(plans.max, total)}\n\n` +

    `🎁 На триале:      <b>${trials}</b>\n` +
    `⏰ Истекают <7д:   <b>${expiringSoon}</b>\n\n` +

    `💡 Платных: <b>${paid}</b> из ${total}\n` +
    `📈 Конверсия: <b>${convPct}%</b>  ${bar(paid, total)}\n\n` +

    `🕐 <i>${now()}</i>`
  )
}

async function sectionRevenue(): Promise<string> {
  const repo  = AppDataSource.getRepository(Payment)
  const n     = new Date()
  const monthStart  = new Date(n.getFullYear(), n.getMonth(), 1)
  const prevStart   = new Date(n.getFullYear(), n.getMonth() - 1, 1)
  const prevEnd     = monthStart
  const yearStart   = new Date(n.getFullYear(), 0, 1)

  const q = async (from: Date, to?: Date) => {
    const qb = repo.createQueryBuilder('p')
      .select('COALESCE(SUM(p.amount), 0)', 'total')
      .addSelect('COUNT(*)', 'count')
      .where('p.status = :s', { s: 'succeeded' })
      .andWhere('p.createdAt >= :from', { from })
    if (to) qb.andWhere('p.createdAt < :to', { to })
    return qb.getRawOne<{ total: string; count: string }>()
  }

  const byPlan = await repo.createQueryBuilder('p')
    .select('p.plan', 'plan')
    .addSelect('COALESCE(SUM(p.amount), 0)', 'total')
    .addSelect('COUNT(*)', 'count')
    .where('p.status = :s', { s: 'succeeded' })
    .andWhere('p.createdAt >= :d', { d: monthStart })
    .groupBy('p.plan')
    .getRawMany<{ plan: string; total: string; count: string }>()

  const [month, prev, year, all] = await Promise.all([q(monthStart), q(prevStart, prevEnd), q(yearStart), q(new Date(0))])

  const mRub = parseInt(month?.total ?? '0') || 0
  const pRub = parseInt(prev?.total  ?? '0') || 0
  const diff = mRub - pRub
  const diffStr = diff >= 0 ? `+${rub(diff)}` : rub(diff)
  const trendStr = trend(mRub, pRub)

  const planLines = ['start', 'pro', 'max'].map(plan => {
    const row = byPlan.find(r => r.plan === plan)
    if (!row) return ''
    const names: Record<string, string> = { start: '🚀 Старт', pro: '⚡ Про', max: '💎 Макс' }
    return `  ${names[plan]}: ${rub(parseInt(row.total) || 0)} (${row.count} шт.)`
  }).filter(Boolean).join('\n')

  return (
    `💰 <b>ВЫРУЧКА</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━\n\n` +

    `📅 Этот месяц: <b>${rub(mRub)}</b> ${trendStr}\n` +
    `  Платежей: ${month?.count ?? 0}\n` +
    `  vs прошлый: ${diffStr}\n\n` +

    (planLines ? `По тарифам:\n${planLines}\n\n` : '') +

    `📅 Прошлый месяц: <b>${rub(pRub)}</b>\n` +
    `📅 За год: <b>${rub(parseInt(year?.total ?? '0') || 0)}</b>\n` +
    `🏆 Всего за всё время: <b>${rub(parseInt(all?.total ?? '0') || 0)}</b>\n\n` +

    `🕐 <i>${now()}</i>`
  )
}

async function sectionActivity(): Promise<string> {
  const n          = new Date()
  const todayStart = new Date(n.getFullYear(), n.getMonth(), n.getDate())
  const monthStart = new Date(n.getFullYear(), n.getMonth(), 1)
  const curMonth   = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`

  const postRepo = AppDataSource.getRepository(Post)

  const [
    totalChannels, totalPosts,
    published, scheduled, drafts,
    postsToday, postsMonth,
    aiMonth,
  ] = await Promise.all([
    AppDataSource.getRepository(Channel).count(),
    postRepo.count(),
    postRepo.count({ where: { status: 'published' } }),
    postRepo.count({ where: { status: 'scheduled' } }),
    postRepo.count({ where: { status: 'draft' } }),
    postRepo.createQueryBuilder('p').where('p.createdAt >= :d', { d: todayStart }).getCount(),
    postRepo.createQueryBuilder('p').where('p.createdAt >= :d', { d: monthStart }).getCount(),
    AppDataSource.getRepository(UsageLog)
      .createQueryBuilder('u')
      .select('COALESCE(SUM(u.aiGenerations), 0)', 'total')
      .where('u.month = :m', { m: curMonth })
      .getRawOne<{ total: string }>()
      .then(r => parseInt(r?.total ?? '0') || 0),
  ])

  return (
    `📢 <b>АКТИВНОСТЬ</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━\n\n` +

    `📡 Каналов: <b>${totalChannels}</b>\n\n` +

    `📝 Посты (всего ${totalPosts}):\n` +
    `  ✅ Опубликовано:  ${published}  ${bar(published, totalPosts)}\n` +
    `  ⏰ Запланировано: ${scheduled}  ${bar(scheduled, totalPosts)}\n` +
    `  📄 Черновики:     ${drafts}  ${bar(drafts, totalPosts)}\n\n` +

    `📥 Создано постов:\n` +
    `  Сегодня: <b>${postsToday}</b>\n` +
    `  Месяц:   <b>${postsMonth}</b>\n\n` +

    `🤖 AI-генераций за месяц: <b>${aiMonth}</b>\n\n` +

    `🕐 <i>${now()}</i>`
  )
}

function sectionServer(): string {
  const totalMem = os.totalmem()
  const freeMem  = os.freemem()
  const usedMem  = totalMem - freeMem
  const memPct   = Math.round(usedMem / totalMem * 100)

  const load   = os.loadavg()
  const cpus   = os.cpus()
  const cpuModel = cpus[0]?.model.replace(/\s+/g, ' ').trim().substring(0, 30) ?? '—'

  const osUp   = os.uptime()
  const osDays = Math.floor(osUp / 86400)
  const osHrs  = Math.floor((osUp % 86400) / 3600)
  const osMins = Math.floor((osUp % 3600) / 60)

  const nodeUp   = process.uptime()
  const nodeHrs  = Math.floor(nodeUp / 3600)
  const nodeMins = Math.floor((nodeUp % 3600) / 60)

  const proc   = process.memoryUsage()
  const heap   = (proc.heapUsed / 1024 / 1024).toFixed(1)
  const rss    = (proc.rss / 1024 / 1024).toFixed(1)

  const memBar = bar(usedMem, totalMem)
  const loadStatus = load[0] < 0.7 ? '🟢' : load[0] < 1.5 ? '🟡' : '🔴'
  const memStatus  = memPct < 70 ? '🟢' : memPct < 90 ? '🟡' : '🔴'

  return (
    `🖥️ <b>СЕРВЕР</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━\n\n` +

    `${memStatus} Память: <b>${mb(usedMem)} / ${mb(totalMem)}</b> (${memPct}%)\n` +
    `  ${memBar}\n` +
    `  Node heap: ${heap} MB  |  RSS: ${rss} MB\n\n` +

    `${loadStatus} CPU: <b>${cpus.length} ядер</b>\n` +
    `  ${cpuModel}\n` +
    `  Load: ${load[0].toFixed(2)} / ${load[1].toFixed(2)} / ${load[2].toFixed(2)}\n\n` +

    `⏱ Uptime ОС:    <b>${osDays}д ${osHrs}ч ${osMins}м</b>\n` +
    `⏱ Uptime Node:  <b>${nodeHrs}ч ${nodeMins}м</b>\n\n` +

    `🔧 Node.js ${process.version}  |  ${process.platform}\n\n` +

    `🕐 <i>${now()}</i>`
  )
}

async function sectionAll(): Promise<string> {
  const [u, p, r, a] = await Promise.all([
    sectionUsers(),
    sectionPlans(),
    sectionRevenue(),
    sectionActivity(),
  ])
  const s = sectionServer()
  const divider = '\n\n━━━━━━━━━━━━━━━━━━━━\n\n'
  return [u, p, r, a, s].join(divider)
}

// ─── Клавиатуры ──────────────────────────────────────────────────────────────

const mainKeyboard: TelegramBot.InlineKeyboardMarkup = {
  inline_keyboard: [
    [
      { text: '👥 Пользователи', callback_data: 'users'    },
      { text: '📋 Подписки',     callback_data: 'plans'    },
    ],
    [
      { text: '💰 Выручка',      callback_data: 'revenue'  },
      { text: '📢 Активность',   callback_data: 'activity' },
    ],
    [
      { text: '🖥️ Сервер',       callback_data: 'server'   },
      { text: '📊 Всё сразу',    callback_data: 'all'      },
    ],
  ],
}

function sectionKeyboard(section: string): TelegramBot.InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: '◀️ Меню',       callback_data: 'back'            },
        { text: '🔄 Обновить',   callback_data: `refresh:${section}` },
      ],
    ],
  }
}

const SECTION_LABELS: Record<string, string> = {
  users: '👥 Пользователи', plans: '📋 Подписки',
  revenue: '💰 Выручка',    activity: '📢 Активность',
  server: '🖥️ Сервер',      all: '📊 Все данные',
}

// ─── Уведомления ─────────────────────────────────────────────────────────────

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

// ─── Основной класс ───────────────────────────────────────────────────────────

class AuditService {
  private bot: TelegramBot | null = null

  async startPolling(): Promise<void> {
    if (!isConfigured()) return

    try {
      await fetch(`https://api.telegram.org/bot${getToken()}/deleteWebhook?drop_pending_updates=true`)
    } catch { /* ignore */ }

    this.bot = new TelegramBot(getToken(), { polling: { interval: 2000 } })
    const b = this.bot

    const menuText = () =>
      `🚀 <b>NeoPost Dashboard</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━\n\n` +
      `Выбери раздел для просмотра статистики:\n\n` +
      `👥 Пользователи — регистрации и прирост\n` +
      `📋 Подписки — тарифы и конверсия\n` +
      `💰 Выручка — доходы по периодам\n` +
      `📢 Активность — посты и AI\n` +
      `🖥️ Сервер — RAM, CPU, uptime\n` +
      `📊 Всё сразу — полный дашборд\n\n` +
      `<i>${now()}</i>`

    const helpText =
      `📖 <b>Команды бота</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━\n\n` +
      `/start — главное меню\n` +
      `/stats — полная статистика\n` +
      `/users — пользователи\n` +
      `/plans — подписки\n` +
      `/revenue — выручка\n` +
      `/activity — активность\n` +
      `/server — состояние сервера\n` +
      `/help — эта справка`

    // /start
    b.onText(/\/start/, async (msg) => {
      if (!isOwner(msg.chat.id)) return
      await b.sendMessage(msg.chat.id, menuText(), {
        parse_mode: 'HTML', reply_markup: mainKeyboard,
      }).catch(() => {})
    })

    // /help
    b.onText(/\/help/, async (msg) => {
      if (!isOwner(msg.chat.id)) return
      await b.sendMessage(msg.chat.id, helpText, { parse_mode: 'HTML' }).catch(() => {})
    })

    // Команды разделов
    const cmdMap: Record<string, () => Promise<string>> = {
      stats:    sectionAll,
      users:    sectionUsers,
      plans:    sectionPlans,
      revenue:  sectionRevenue,
      activity: sectionActivity,
      server:   async () => sectionServer(),
    }

    for (const [cmd, fn] of Object.entries(cmdMap)) {
      b.onText(new RegExp(`^\\/${cmd}$`), async (msg) => {
        if (!isOwner(msg.chat.id)) return
        await b.sendChatAction(msg.chat.id, 'typing').catch(() => {})
        const text = await fn()
        await b.sendMessage(msg.chat.id, text, {
          parse_mode: 'HTML',
          reply_markup: cmd !== 'stats' ? sectionKeyboard(cmd) : sectionKeyboard('all'),
        }).catch(() => {})
      })
    }

    // Inline callback
    b.on('callback_query', async (query) => {
      if (!isOwner(query.message?.chat.id ?? 0)) return
      const chatId = query.message!.chat.id
      const msgId  = query.message!.message_id
      const data   = query.data ?? ''

      if (data === 'back') {
        await b.answerCallbackQuery(query.id).catch(() => {})
        await b.editMessageText(menuText(), {
          chat_id: chatId, message_id: msgId,
          parse_mode: 'HTML', reply_markup: mainKeyboard,
        }).catch(() => {})
        return
      }

      const section = data.startsWith('refresh:') ? data.slice(8) : data
      await b.answerCallbackQuery(query.id, { text: `Обновляю ${SECTION_LABELS[section] ?? ''}...` }).catch(() => {})

      try {
        const fn = cmdMap[section] ?? sectionAll
        const text = await fn()
        await b.editMessageText(text, {
          chat_id: chatId, message_id: msgId,
          parse_mode: 'HTML', reply_markup: sectionKeyboard(section),
        }).catch(() => {})
      } catch (err) {
        console.error('[AUDIT] callback error:', err)
      }
    })

    b.on('polling_error', (err: Error) => {
      if (!err.message.includes('409')) console.error('[AUDIT BOT] Polling error:', err.message)
    })

    const stop = async () => { await b.stopPolling().catch(() => {}) }
    process.once('SIGTERM', stop)
    process.once('SIGINT', stop)

    console.log('[AUDIT BOT] Started')
  }

  // ─── Push-уведомления ──────────────────────────────────────────────────────

  notifyNewUser(user: {
    id: string; email: string | null; username: string | null
    firstName: string; via: 'email' | 'telegram'
  }): void {
    const who = user.email
      ? `📧 <b>${user.firstName}</b> (${user.email})`
      : `✈️ <b>${user.firstName}</b>${user.username ? ` @${user.username}` : ''}`
    send(
      `👤 <b>Новый пользователь</b>\n` +
      `${who}\n` +
      `Вход: ${user.via === 'email' ? 'Email' : 'Telegram'}\n` +
      `ID: <code>${user.id}</code>\n` +
      `🕐 ${now()}`,
    ).catch(() => {})
  }

  notifyNewPayment(info: {
    userId: string; email: string | null; firstName: string
    plan: string; months: number; amount: number
  }): void {
    const names: Record<string, string> = { start: '🚀 Старт', pro: '⚡ Про', max: '💎 Макс' }
    send(
      `💰 <b>Новая оплата</b>\n` +
      `👤 ${info.firstName}${info.email ? ` (${info.email})` : ''}\n` +
      `📦 ${names[info.plan] ?? info.plan} × ${info.months} мес.\n` +
      `💵 <b>${rub(info.amount)}</b>\n` +
      `ID: <code>${info.userId}</code>\n` +
      `🕐 ${now()}`,
    ).catch(() => {})
  }
}

export const auditService = new AuditService()

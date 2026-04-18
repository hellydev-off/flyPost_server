/**
 * Audit Bot — уведомления о новых пользователях и оплатах + команда /start со статистикой.
 * Env vars: AUDIT_BOT_TOKEN, AUDIT_CHAT_ID
 */

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

function isConfigured(): boolean {
  return !!(getToken() && getChatId())
}

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

async function buildStatsMessage(): Promise<string> {
  const now = new Date()
  const todayStart  = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const weekStart   = new Date(todayStart); weekStart.setDate(weekStart.getDate() - 7)
  const monthStart  = new Date(now.getFullYear(), now.getMonth(), 1)
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  const userRepo    = AppDataSource.getRepository(User)
  const channelRepo = AppDataSource.getRepository(Channel)
  const postRepo    = AppDataSource.getRepository(Post)
  const subRepo     = AppDataSource.getRepository(UserSubscription)
  const usageRepo   = AppDataSource.getRepository(UsageLog)
  const paymentRepo = AppDataSource.getRepository(Payment)

  const [
    totalUsers,
    usersToday,
    usersWeek,
    usersMonth,
    totalChannels,
    publishedPosts,
    trialsActive,
  ] = await Promise.all([
    userRepo.count(),
    userRepo.createQueryBuilder('u').where('u.createdAt >= :d', { d: todayStart }).getCount(),
    userRepo.createQueryBuilder('u').where('u.createdAt >= :d', { d: weekStart }).getCount(),
    userRepo.createQueryBuilder('u').where('u.createdAt >= :d', { d: monthStart }).getCount(),
    channelRepo.count(),
    postRepo.count({ where: { status: 'published' } }),
    subRepo.createQueryBuilder('s').where('s.trialEndsAt > :now', { now }).getCount(),
  ])

  // Планы
  const planRows = await subRepo
    .createQueryBuilder('s')
    .select('s.plan', 'plan')
    .addSelect('COUNT(*)', 'count')
    .groupBy('s.plan')
    .getRawMany<{ plan: string; count: string }>()
  const plans: Record<string, number> = { free: 0, start: 0, pro: 0, max: 0 }
  for (const r of planRows) plans[r.plan] = parseInt(r.count)

  // AI генерации за месяц
  const aiRow = await usageRepo
    .createQueryBuilder('u')
    .select('SUM(u.aiGenerations)', 'total')
    .where('u.month = :m', { m: currentMonth })
    .getRawOne<{ total: string }>()
  const aiMonth = parseInt(aiRow?.total ?? '0') || 0

  // Выручка за месяц
  const revenueRow = await paymentRepo
    .createQueryBuilder('p')
    .select('SUM(p.amount)', 'total')
    .addSelect('COUNT(*)', 'count')
    .where('p.status = :s', { s: 'succeeded' })
    .andWhere('p.createdAt >= :d', { d: monthStart })
    .getRawOne<{ total: string; count: string }>()
  const revenueMonth  = parseInt(revenueRow?.total ?? '0') || 0
  const paymentsMonth = parseInt(revenueRow?.count ?? '0') || 0

  const date = now.toLocaleDateString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric' })

  return (
    `📊 <b>Статистика NeoPost</b>\n` +
    `<i>${date}</i>\n\n` +

    `👥 <b>Пользователи</b>\n` +
    `  Всего: <b>${totalUsers}</b>\n` +
    `  Сегодня: <b>+${usersToday}</b>\n` +
    `  За неделю: <b>+${usersWeek}</b>\n` +
    `  За месяц: <b>+${usersMonth}</b>\n\n` +

    `📋 <b>Тарифы</b>\n` +
    `  🆓 Free: ${plans.free}\n` +
    `  🚀 Старт: ${plans.start}\n` +
    `  ⚡️ Про: ${plans.pro}\n` +
    `  💎 Макс: ${plans.max}\n` +
    `  🎁 Триал: ${trialsActive}\n\n` +

    `💰 <b>Выручка (месяц)</b>\n` +
    `  Сумма: <b>${revenueMonth} ₽</b>\n` +
    `  Платежей: ${paymentsMonth}\n\n` +

    `📢 Каналов: <b>${totalChannels}</b>\n` +
    `✅ Публикаций всего: <b>${publishedPosts}</b>\n` +
    `🤖 AI-генераций (месяц): <b>${aiMonth}</b>`
  )
}

class AuditService {
  startPolling(): void {
    if (!isConfigured()) return

    const bot = new TelegramBot(getToken(), { polling: true })

    bot.onText(/\/start|\/stats/, async (msg) => {
      // Отвечаем только владельцу
      if (String(msg.chat.id) !== getChatId()) return

      try {
        await bot.sendChatAction(msg.chat.id, 'typing')
        const text = await buildStatsMessage()
        await bot.sendMessage(msg.chat.id, text, { parse_mode: 'HTML' })
      } catch (err) {
        console.error('[AUDIT] /start stats error:', err)
        await bot.sendMessage(msg.chat.id, '❌ Не удалось получить статистику').catch(() => {})
      }
    })

    bot.on('polling_error', (err) => {
      console.error('[AUDIT BOT] Polling error:', err.message)
    })

    console.log('[AUDIT BOT] Started')
  }

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
      `Вход через: ${user.via === 'email' ? 'Email' : 'Telegram'}\n` +
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

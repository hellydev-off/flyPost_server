import { Queue, Worker, Job } from 'bullmq'
import IORedis from 'ioredis'
import { AppDataSource } from '../config/database'
import { User } from '../entities/User'
import { Post } from '../entities/Post'
import { Channel } from '../entities/Channel'
import { ChannelStatsHistory } from '../entities/ChannelStatsHistory'
import { isMockMode } from '../utils/mockMode'
import { bot } from '../bot/bot'
import { Between, MoreThan } from 'typeorm'

const APP_URL = process.env.MINI_APP_URL || 'https://t.me/neoPostBot/app'

function dayLabel(n: number): string {
  if (n % 10 === 1 && n % 100 !== 11) return 'день'
  if (n % 10 >= 2 && n % 10 <= 4 && !(n % 100 >= 12 && n % 100 <= 14)) return 'дня'
  return 'дней'
}

async function getUserStreak(userId: string): Promise<number> {
  const postRepo = AppDataSource.getRepository(Post)
  const channels = await AppDataSource.getRepository(Channel).find({ where: { user: { id: userId } } })
  if (!channels.length) return 0

  let streak = 0
  const now = new Date()

  for (let daysBack = 0; daysBack < 365; daysBack++) {
    const dayStart = new Date(now)
    dayStart.setDate(now.getDate() - daysBack)
    dayStart.setHours(0, 0, 0, 0)
    const dayEnd = new Date(dayStart)
    dayEnd.setHours(23, 59, 59, 999)

    const count = await postRepo.count({
      where: { user: { id: userId }, status: 'published', publishedAt: Between(dayStart, dayEnd) },
    })

    if (count > 0) streak++
    else if (daysBack > 0) break
  }
  return streak
}

async function sendStreakReminders(): Promise<void> {
  const userRepo = AppDataSource.getRepository(User)
  const postRepo = AppDataSource.getRepository(Post)

  const users = await userRepo.find({ where: { telegramId: MoreThan('0') } } as never)

  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  for (const user of users) {
    if (!user.telegramId) continue

    try {
      const todayPosts = await postRepo.count({
        where: { user: { id: user.id }, status: 'published', publishedAt: MoreThan(todayStart) },
      })
      if (todayPosts > 0) continue

      const streak = await getUserStreak(user.id)
      if (streak === 0) continue

      await bot.sendMessage(
        Number(user.telegramId),
        `🔥 *Не прерывай серию!*\n\n` +
        `У тебя *${streak} ${dayLabel(streak)}* подряд — не теряй streak сегодня.`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [[{ text: 'Создать пост быстро →', web_app: { url: APP_URL } }]],
          },
        },
      )
    } catch { /* skip user */ }
  }
}

async function sendWeeklyDigest(): Promise<void> {
  const userRepo = AppDataSource.getRepository(User)
  const postRepo = AppDataSource.getRepository(Post)
  const channelRepo = AppDataSource.getRepository(Channel)
  const historyRepo = AppDataSource.getRepository(ChannelStatsHistory)

  const users = await userRepo.find({ where: { telegramId: MoreThan('0') } } as never)

  const weekAgo = new Date()
  weekAgo.setDate(weekAgo.getDate() - 7)
  weekAgo.setHours(0, 0, 0, 0)

  for (const user of users) {
    if (!user.telegramId) continue

    try {
      const channels = await channelRepo.find({ where: { user: { id: user.id } } })
      if (!channels.length) continue

      const mainChannel = channels[0]

      const weekPosts = await postRepo.count({
        where: { user: { id: user.id }, status: 'published', publishedAt: MoreThan(weekAgo) },
      })

      const streak = await getUserStreak(user.id)

      const latestHistory = await historyRepo.findOne({
        where: { channel: { id: mainChannel.id } },
        order: { recordedAt: 'DESC' },
      })
      const healthScore = latestHistory ? Math.min(100, Math.round(latestHistory.subscriberCount / 10)) : null

      const name = user.firstName || 'друг'

      let text: string
      if (weekPosts === 0) {
        text =
          `📊 *Итоги недели, ${name}!*\n\n` +
          `Канал: *${mainChannel.title}*\n\n` +
          `На этой неделе постов не было 😔\n` +
          `Начни новую серию прямо сейчас!`
      } else {
        text =
          `📊 *Итоги недели, ${name}!*\n\n` +
          `Канал: *${mainChannel.title}*\n` +
          `✅ Опубликовано постов: *${weekPosts}*\n` +
          `🔥 Серия: *${streak} ${dayLabel(streak)}*\n` +
          (healthScore !== null ? `💚 Здоровье канала: *${healthScore}/100*\n` : '')
      }

      await bot.sendMessage(Number(user.telegramId), text, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[{ text: 'Смотреть аналитику →', web_app: { url: APP_URL } }]],
        },
      })
    } catch { /* skip user */ }
  }
}

class ReminderService {
  private queue: Queue | null = null

  initialize(): void {
    if (isMockMode) return

    const connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: null,
    })

    this.queue = new Queue('reminders', { connection })

    new Worker(
      'reminders',
      async (job: Job) => {
        if (job.name === 'streak-reminder') await sendStreakReminders()
        if (job.name === 'weekly-digest') await sendWeeklyDigest()
      },
      { connection },
    )

    // Ежедневно в 20:00 МСК (UTC+3 = 17:00 UTC)
    this.queue.add(
      'streak-reminder',
      {},
      {
        repeat: { pattern: '0 17 * * *' },
        jobId: 'streak-reminder-daily',
      },
    )

    // Каждое воскресенье в 19:00 МСК (16:00 UTC)
    this.queue.add(
      'weekly-digest',
      {},
      {
        repeat: { pattern: '0 16 * * 0' },
        jobId: 'weekly-digest-sunday',
      },
    )

    console.log('[REMINDERS] Streak reminder (20:00 MSK) and weekly digest (Sun 19:00 MSK) initialized')
  }
}

export const reminderService = new ReminderService()

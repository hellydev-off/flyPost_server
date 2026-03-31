import { AppDataSource } from '../config/database'
import { Post } from '../entities/Post'
import { AppError } from '../utils/AppError'
import { Channel } from '../entities/Channel'
import { ChannelStatsHistory } from '../entities/ChannelStatsHistory'
import { grokService } from './grok.service'
import { MoreThan, In } from 'typeorm'

interface ChannelAnalytics {
  total: number
  published: number
  scheduled: number
  drafts: number
  lastPosts: Post[]
}

interface AiInsight {
  title: string
  text: string
  type: 'tip' | 'warning' | 'success'
}

export interface SubscriberPoint {
  count: number
  recordedAt: string
}

export interface SubscriberHistory {
  history: SubscriberPoint[]
  current: number | null
  growth7d: number | null
  growth30d: number | null
}

export interface BestTimeSlot {
  hour: number
  postsCount: number
  avgGrowth: number | null
}

export interface BestTimeData {
  hasEnoughData: boolean
  slots: BestTimeSlot[]
}

export interface HealthScoreFactors {
  regularity: number
  growth: number
  activity: number
}

export interface HealthScoreData {
  score: number
  factors: HealthScoreFactors
}

export interface StreakData {
  streak: number
  lastPostDate: string | null
}

class AnalyticsService {
  private get postRepo() {
    return AppDataSource.getRepository(Post)
  }

  private get channelRepo() {
    return AppDataSource.getRepository(Channel)
  }

  private get historyRepo() {
    return AppDataSource.getRepository(ChannelStatsHistory)
  }

  async getChannelAnalytics(channelId: string, userId: string): Promise<ChannelAnalytics> {
    const channel = await this.channelRepo.findOne({
      where: { id: channelId, user: { id: userId } },
    })
    if (!channel) {
      throw new AppError('Channel not found', 404)
    }

    const [total, published, scheduled, drafts, lastPosts] = await Promise.all([
      this.postRepo.count({ where: { channel: { id: channelId } } }),
      this.postRepo.count({ where: { channel: { id: channelId }, status: 'published' } }),
      this.postRepo.count({ where: { channel: { id: channelId }, status: 'scheduled' } }),
      this.postRepo.count({ where: { channel: { id: channelId }, status: 'draft' } }),
      this.postRepo.find({
        where: { channel: { id: channelId } },
        order: { createdAt: 'DESC' },
        take: 5,
      }),
    ])

    return { total, published, scheduled, drafts, lastPosts }
  }

  async getSubscriberHistory(channelId: string, userId: string): Promise<SubscriberHistory> {
    const channel = await this.channelRepo.findOne({
      where: { id: channelId, user: { id: userId } },
    })
    if (!channel) {
      throw new AppError('Channel not found', 404)
    }

    const history = await this.historyRepo.find({
      where: { channel: { id: channelId } },
      order: { recordedAt: 'ASC' },
      take: 90, // последние ~90 точек (при hourly = 90 часов = ~3.75 дня, при daily = 3 месяца)
    })

    const points: SubscriberPoint[] = history.map((h) => ({
      count: h.subscriberCount,
      recordedAt: h.recordedAt.toISOString(),
    }))

    const current = points.length > 0 ? points[points.length - 1].count : null

    // Прирост за 7 дней
    const now = Date.now()
    const point7d = points.find((p) => now - new Date(p.recordedAt).getTime() <= 7 * 24 * 3600 * 1000)
    const growth7d = current !== null && point7d ? current - point7d.count : null

    // Прирост за 30 дней
    const point30d = points.find((p) => now - new Date(p.recordedAt).getTime() <= 30 * 24 * 3600 * 1000)
    const growth30d = current !== null && point30d ? current - point30d.count : null

    return { history: points, current, growth7d, growth30d }
  }

  async getAiInsights(channelId: string, userId: string): Promise<AiInsight[]> {
    const channel = await this.channelRepo.findOne({
      where: { id: channelId, user: { id: userId } },
    })
    if (!channel) {
      throw new AppError('Channel not found', 404)
    }

    // Collect data for analysis
    const posts = await this.postRepo.find({
      where: { channel: { id: channelId } },
      order: { createdAt: 'DESC' },
      take: 20,
    })

    if (posts.length < 2) {
      return [{
        title: 'Мало данных',
        text: 'Опубликуйте больше постов, чтобы получить AI-рекомендации по улучшению контента.',
        type: 'tip',
      }]
    }

    const published = posts.filter(p => p.status === 'published')
    const drafts = posts.filter(p => p.status === 'draft')

    const postSummaries = posts.slice(0, 15).map(p => {
      const date = new Date(p.createdAt)
      const day = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'][date.getDay()]
      const hour = date.getHours()
      return `[${p.status}] ${day} ${hour}:00 | ${p.content.slice(0, 100)}`
    })

    const prompt = `Проанализируй данные Telegram-канала "${channel.title}" и дай 3-4 конкретных рекомендации.

Статистика:
- Всего постов: ${posts.length}
- Опубликовано: ${published.length}
- Черновиков: ${drafts.length}

Последние посты (статус, день, время, начало текста):
${postSummaries.join('\n')}

Дай рекомендации в формате JSON массива:
[{"title":"Заголовок","text":"Текст рекомендации","type":"tip|warning|success"}]

Типы: tip — совет, warning — проблема, success — что уже хорошо.
Отвечай ТОЛЬКО JSON без markdown-обёртки.`

    try {
      const raw = await grokService.rawRequest(
        'Ты аналитик Telegram-каналов. Анализируй данные и давай конкретные рекомендации на русском. Отвечай ТОЛЬКО JSON.',
        prompt,
      )

      const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      const insights = JSON.parse(cleaned) as AiInsight[]
      return insights.slice(0, 5)
    } catch (err) {
      console.error('[ANALYTICS] AI insights error:', err)
      return [{
        title: 'Анализ недоступен',
        text: 'Не удалось получить AI-рекомендации. Попробуйте позже.',
        type: 'warning',
      }]
    }
  }

  async getBestPublishingTime(channelId: string, userId: string): Promise<BestTimeData> {
    const channel = await this.channelRepo.findOne({ where: { id: channelId, user: { id: userId } } })
    if (!channel) throw new AppError('Channel not found', 404)

    const posts = await this.postRepo.find({
      where: { channel: { id: channelId }, status: 'published' },
      order: { publishedAt: 'DESC' },
      take: 50,
      select: ['id', 'publishedAt'],
    })

    const publishedPosts = posts.filter(p => p.publishedAt != null)
    if (publishedPosts.length < 3) {
      return { hasEnoughData: false, slots: [] }
    }

    const history = await this.historyRepo.find({
      where: { channel: { id: channelId } },
      order: { recordedAt: 'ASC' },
      select: ['subscriberCount', 'recordedAt'],
    })

    const hourData = new Map<number, { growths: number[]; count: number }>()

    for (const post of publishedPosts) {
      const publishedAt = new Date(post.publishedAt!)
      const hour = publishedAt.getHours()

      if (!hourData.has(hour)) hourData.set(hour, { growths: [], count: 0 })
      const slot = hourData.get(hour)!
      slot.count++

      if (history.length > 0) {
        const tPost = publishedAt.getTime()
        const before = history.filter(h => {
          const t = new Date(h.recordedAt).getTime()
          return t < tPost && t > tPost - 6 * 3600 * 1000
        })
        const after = history.filter(h => {
          const t = new Date(h.recordedAt).getTime()
          return t > tPost && t < tPost + 24 * 3600 * 1000
        })
        if (before.length > 0 && after.length > 0) {
          slot.growths.push(
            after[after.length - 1].subscriberCount - before[before.length - 1].subscriberCount,
          )
        }
      }
    }

    const slots: BestTimeSlot[] = [...hourData.entries()].map(([hour, data]) => ({
      hour,
      postsCount: data.count,
      avgGrowth: data.growths.length > 0
        ? Math.round(data.growths.reduce((a, b) => a + b, 0) / data.growths.length)
        : null,
    }))

    const hasGrowthData = slots.some(s => s.avgGrowth !== null)
    slots.sort((a, b) =>
      hasGrowthData
        ? (b.avgGrowth ?? -9999) - (a.avgGrowth ?? -9999)
        : b.postsCount - a.postsCount,
    )

    return { hasEnoughData: true, slots: slots.slice(0, 3) }
  }

  async getHealthScore(channelId: string, userId: string): Promise<HealthScoreData> {
    const channel = await this.channelRepo.findOne({ where: { id: channelId, user: { id: userId } } })
    if (!channel) throw new AppError('Channel not found', 404)

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000)
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 3600 * 1000)

    const [postsLast7d, postsLast3d] = await Promise.all([
      this.postRepo.count({
        where: { channel: { id: channelId }, status: 'published', publishedAt: MoreThan(sevenDaysAgo) },
      }),
      this.postRepo.count({
        where: { channel: { id: channelId }, status: 'published', publishedAt: MoreThan(threeDaysAgo) },
      }),
    ])

    const subHistory = await this.getSubscriberHistory(channelId, userId)

    const regularityScore = Math.min(Math.round((postsLast7d / 7) * 100), 100)

    let growthScore = 50
    if (subHistory.current && subHistory.current > 0 && subHistory.growth7d !== null) {
      const growthPct = (subHistory.growth7d / subHistory.current) * 100
      growthScore = Math.min(Math.max(Math.round(50 + growthPct * 10), 0), 100)
    }

    const activityScore = postsLast3d > 0 ? 100 : postsLast7d > 0 ? 60 : 0

    const score = Math.round(regularityScore * 0.4 + growthScore * 0.4 + activityScore * 0.2)

    return {
      score,
      factors: {
        regularity: regularityScore,
        growth: growthScore,
        activity: activityScore,
      },
    }
  }

  async getStreak(channelId: string, userId: string): Promise<StreakData> {
    const channel = await this.channelRepo.findOne({ where: { id: channelId, user: { id: userId } } })
    if (!channel) throw new AppError('Channel not found', 404)

    const since = new Date(Date.now() - 60 * 24 * 3600 * 1000)
    const posts = await this.postRepo.find({
      where: { channel: { id: channelId }, status: 'published', publishedAt: MoreThan(since) },
      select: ['publishedAt'],
      order: { publishedAt: 'DESC' },
    })

    const dayKey = (d: Date): string =>
      `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`

    const publishedDays = new Set(
      posts.filter(p => p.publishedAt).map(p => dayKey(new Date(p.publishedAt!))),
    )

    const today = new Date()
    const startOffset = publishedDays.has(dayKey(today)) ? 0 : 1

    let streak = 0
    for (let i = startOffset; i < 60; i++) {
      const d = new Date(today)
      d.setUTCDate(d.getUTCDate() - i)
      if (publishedDays.has(dayKey(d))) {
        streak++
      } else {
        break
      }
    }

    return {
      streak,
      lastPostDate: posts[0]?.publishedAt?.toISOString() ?? null,
    }
  }
}

export const analyticsService = new AnalyticsService()

import { Request, Response, NextFunction } from 'express'
import { grokService } from '../services/grok.service'
import { channelProfileService } from '../services/channelProfile.service'
import { subscriptionService } from '../services/subscription.service'
import { AppDataSource } from '../config/database'
import { Post } from '../entities/Post'
import { Channel } from '../entities/Channel'
import { AppError } from '../utils/AppError'
import { AiPlan } from '../entities/AiPlan'

/** Extracts first JSON array found in a string, handles markdown fences and surrounding text. */
function extractJsonArray(raw: string): unknown[] | null {
  // Strip markdown code fences
  const stripped = raw.replace(/```(?:json)?\n?/g, '').replace(/```/g, '').trim()
  // Find first '[' and matching ']'
  const start = stripped.indexOf('[')
  if (start === -1) return null
  let depth = 0
  for (let i = start; i < stripped.length; i++) {
    if (stripped[i] === '[') depth++
    else if (stripped[i] === ']') {
      depth--
      if (depth === 0) {
        try {
          return JSON.parse(stripped.slice(start, i + 1))
        } catch {
          return null
        }
      }
    }
  }
  return null
}

const MAX_POSTS_PER_DAY = 8

function buildTimeSlots(startHour: number, intervalMinutes: number): string[] {
  const slots: string[] = []
  let current = startHour * 60
  const end = 22 * 60
  while (current <= end && slots.length < MAX_POSTS_PER_DAY) {
    const h = Math.floor(current / 60)
    const m = current % 60
    slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
    current += intervalMinutes
  }
  return slots
}

export const aiController = {
  async generate(req: Request, res: Response, next: NextFunction): Promise<void> {
    const userId = req.user!.userId
    await subscriptionService.assertAiLimit(userId)
    // Инкремент ДО вызова AI: второй параллельный запрос увидит обновлённый счётчик
    await subscriptionService.incrementAiUsage(userId)
    const { topic, tone, length, channelId } = req.body as {
      topic: string
      tone: string
      length: 'short' | 'medium' | 'long'
      channelId?: string
    }

    const voiceProfile = channelId
      ? await channelProfileService.getByChannelId(channelId)
      : null

    const content = await grokService.generateContent({ topic, tone, length, voiceProfile })
    res.json({ content })
  },

  async improve(req: Request, res: Response, next: NextFunction): Promise<void> {
    const userId = req.user!.userId
    await subscriptionService.assertAiLimit(userId)
    await subscriptionService.incrementAiUsage(userId)
    const { content, action, tone, channelId } = req.body as {
      content: string
      action: 'shorten' | 'expand' | 'rephrase' | 'fix' | 'tone'
      tone?: string
      channelId?: string
    }

    const voiceProfile = channelId
      ? await channelProfileService.getByChannelId(channelId)
      : null

    const result = await grokService.improveContent({ content, action, tone, voiceProfile })
    res.json({ content: result })
  },

  async dailyPlan(req: Request, res: Response, next: NextFunction): Promise<void> {
    const { channelId, startHour, intervalMinutes } = req.body as {
      channelId: string
      startHour: number
      intervalMinutes: number
    }
    const userId = req.user!.userId
    await subscriptionService.assertFeature(userId, 'weeklyPlan')
    await subscriptionService.assertAiLimit(userId)

    const channel = await AppDataSource.getRepository(Channel).findOne({
      where: { id: channelId, user: { id: userId } },
    })
    if (!channel) throw new AppError('Channel not found', 404)

    const recentPosts = await AppDataSource.getRepository(Post).find({
      where: { channel: { id: channelId }, status: 'published' },
      order: { publishedAt: 'DESC' },
      take: 10,
      select: ['id', 'content', 'publishedAt'],
    })

    const warning = recentPosts.length < 5
      ? 'Мало опубликованных постов — план может быть неточным'
      : undefined

    const recentSummary = recentPosts
      .map((p, i) => `${i + 1}. ${p.content.slice(0, 100)}`)
      .join('\n')

    const timeSlots = buildTimeSlots(startHour, intervalMinutes)
    const voiceProfile = await channelProfileService.getByChannelId(channelId)
    await subscriptionService.incrementAiUsage(userId)
    const raw = await grokService.generateDailyPlan(channel.title, timeSlots, recentSummary, voiceProfile)

    const ideas = extractJsonArray(raw)
    if (!ideas) throw new AppError('AI вернул некорректный ответ. Попробуйте ещё раз.', 502)

    AppDataSource.getRepository(AiPlan).save(
      AppDataSource.getRepository(AiPlan).create({ userId, channelId, type: 'daily', ideas: ideas as object[], warning: warning ?? null })
    ).catch(() => {})

    res.json({ ideas, warning })
  },

  async weeklyPlan(req: Request, res: Response, next: NextFunction): Promise<void> {
    const { channelId, postsPerDay = 1 } = req.body as { channelId: string; postsPerDay?: number }
    const userId = req.user!.userId
    await subscriptionService.assertFeature(userId, 'weeklyPlan')
    await subscriptionService.assertAiLimit(userId)

    const clampedPostsPerDay = Math.min(Math.max(Number(postsPerDay) || 1, 1), 4)

    const channel = await AppDataSource.getRepository(Channel).findOne({
      where: { id: channelId, user: { id: userId } },
    })
    if (!channel) throw new AppError('Channel not found', 404)

    const recentPosts = await AppDataSource.getRepository(Post).find({
      where: { channel: { id: channelId }, status: 'published' },
      order: { publishedAt: 'DESC' },
      take: 10,
      select: ['id', 'content', 'publishedAt'],
    })

    const recentSummary = recentPosts
      .map((p, i) => `${i + 1}. ${p.content.slice(0, 100)}`)
      .join('\n')

    const voiceProfile = await channelProfileService.getByChannelId(channelId)
    await subscriptionService.incrementAiUsage(userId)
    const raw = await grokService.generateWeeklyPlan(channel.title, recentSummary, clampedPostsPerDay, voiceProfile)

    const ideas = extractJsonArray(raw)
    if (!ideas) throw new AppError('AI вернул некорректный ответ. Попробуйте ещё раз.', 502)

    AppDataSource.getRepository(AiPlan).save(
      AppDataSource.getRepository(AiPlan).create({ userId, channelId, type: 'weekly', ideas: ideas as object[] })
    ).catch(() => {})

    res.json({ ideas })
  },

  async getPlans(req: Request, res: Response, next: NextFunction): Promise<void> {
    const userId = req.user!.userId
    const { channelId, type } = req.query as { channelId?: string; type?: string }

    const where: Record<string, unknown> = { userId }
    if (channelId) where.channelId = channelId
    if (type === 'daily' || type === 'weekly') where.type = type

    const plans = await AppDataSource.getRepository(AiPlan).find({
      where,
      order: { createdAt: 'DESC' },
      take: 30,
    })

    res.json({ plans })
  },
}

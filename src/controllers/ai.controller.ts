import { Request, Response, NextFunction } from 'express'
import { grokService } from '../services/grok.service'
import { channelProfileService } from '../services/channelProfile.service'
import { subscriptionService } from '../services/subscription.service'
import { AppDataSource } from '../config/database'
import { Post } from '../entities/Post'
import { Channel } from '../entities/Channel'
import { AppError } from '../utils/AppError'

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

export const aiController = {
  async generate(req: Request, res: Response, next: NextFunction): Promise<void> {
    const userId = req.user!.userId
    await subscriptionService.assertAiLimit(userId)
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
    subscriptionService.incrementAiUsage(userId).catch(() => {})
    res.json({ content })
  },

  async improve(req: Request, res: Response, next: NextFunction): Promise<void> {
    const userId = req.user!.userId
    await subscriptionService.assertAiLimit(userId)
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
    subscriptionService.incrementAiUsage(userId).catch(() => {})
    res.json({ content: result })
  },

  async weeklyPlan(req: Request, res: Response, next: NextFunction): Promise<void> {
    const { channelId } = req.body as { channelId: string }
    const userId = req.user!.userId
    await subscriptionService.assertFeature(userId, 'weeklyPlan')

    const channel = await AppDataSource.getRepository(Channel).findOne({
      where: { id: channelId, user: { id: userId } },
    })
    if (!channel) throw new AppError('Channel not found', 404)

    const recentPosts = await AppDataSource.getRepository(Post).find({
      where: { channel: { id: channelId }, status: 'published' },
      order: { publishedAt: 'DESC' },
      take: 5,
      select: ['content'],
    })

    const recentSummary = recentPosts
      .map((p, i) => `${i + 1}. ${p.content.slice(0, 100)}`)
      .join('\n')

    const voiceProfile = await channelProfileService.getByChannelId(channelId)
    const raw = await grokService.generateWeeklyPlan(channel.title, recentSummary, voiceProfile)

    // Robustly extract JSON array from AI response (may include markdown, extra text, etc.)
    const ideas = extractJsonArray(raw)
    if (!ideas) throw new AppError('AI вернул некорректный ответ. Попробуйте ещё раз.', 502)

    res.json({ ideas })
  },
}

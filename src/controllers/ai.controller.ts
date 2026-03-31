import { Request, Response, NextFunction } from 'express'
import { grokService } from '../services/grok.service'
import { channelProfileService } from '../services/channelProfile.service'
import { AppDataSource } from '../config/database'
import { Post } from '../entities/Post'
import { Channel } from '../entities/Channel'
import { AppError } from '../utils/AppError'

export const aiController = {
  async generate(req: Request, res: Response, next: NextFunction): Promise<void> {
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

  async weeklyPlan(req: Request, res: Response, next: NextFunction): Promise<void> {
    const { channelId } = req.body as { channelId: string }
    const userId = req.user!.userId

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
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const ideas = JSON.parse(cleaned)

    res.json({ ideas })
  },
}

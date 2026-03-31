import { Request, Response, NextFunction } from 'express'
import { analyticsService } from '../services/analytics.service'

export const analyticsController = {
  async getChannelAnalytics(req: Request, res: Response, next: NextFunction): Promise<void> {
    const stats = await analyticsService.getChannelAnalytics(
      req.params.channelId,
      req.user!.userId,
    )
    res.json(stats)
  },

  async getAiInsights(req: Request, res: Response, next: NextFunction): Promise<void> {
    const insights = await analyticsService.getAiInsights(
      req.params.channelId,
      req.user!.userId,
    )
    res.json({ insights })
  },

  async getSubscriberHistory(req: Request, res: Response, next: NextFunction): Promise<void> {
    const data = await analyticsService.getSubscriberHistory(
      req.params.channelId,
      req.user!.userId,
    )
    res.json(data)
  },

  async getBestTime(req: Request, res: Response, next: NextFunction): Promise<void> {
    const data = await analyticsService.getBestPublishingTime(
      req.params.channelId,
      req.user!.userId,
    )
    res.json(data)
  },

  async getHealthScore(req: Request, res: Response, next: NextFunction): Promise<void> {
    const data = await analyticsService.getHealthScore(
      req.params.channelId,
      req.user!.userId,
    )
    res.json(data)
  },

  async getStreak(req: Request, res: Response, next: NextFunction): Promise<void> {
    const data = await analyticsService.getStreak(
      req.params.channelId,
      req.user!.userId,
    )
    res.json(data)
  },
}

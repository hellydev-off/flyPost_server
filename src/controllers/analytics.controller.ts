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
}

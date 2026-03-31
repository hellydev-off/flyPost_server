import { Request, Response, NextFunction } from 'express'
import { competitorService } from '../services/competitor.service'
import { subscriptionService } from '../services/subscription.service'

export const competitorController = {
  async getAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    await subscriptionService.assertFeature(req.user!.userId, 'competitors')
    const data = await competitorService.getAll(req.user!.userId)
    res.json(data)
  },

  async add(req: Request, res: Response, next: NextFunction): Promise<void> {
    await subscriptionService.assertFeature(req.user!.userId, 'competitors')
    const { channelUsername, title } = req.body as { channelUsername: string; title: string }
    const competitor = await competitorService.add(req.user!.userId, { channelUsername, title })
    res.status(201).json(competitor)
  },

  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    await competitorService.delete(req.user!.userId, req.params.id)
    res.status(204).send()
  },

  async analyze(req: Request, res: Response, next: NextFunction): Promise<void> {
    const competitor = await competitorService.analyze(req.user!.userId, req.params.id)
    res.json(competitor)
  },
}

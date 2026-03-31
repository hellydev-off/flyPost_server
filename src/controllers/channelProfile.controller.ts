import { Request, Response } from 'express'
import { channelProfileService } from '../services/channelProfile.service'

export const channelProfileController = {
  async get(req: Request, res: Response): Promise<void> {
    const profile = await channelProfileService.get(req.params.channelId, req.user!.userId)
    res.json(profile ?? { channelId: req.params.channelId, tone: null, audience: null, topics: [], forbiddenWords: [], examples: null })
  },

  async upsert(req: Request, res: Response): Promise<void> {
    const profile = await channelProfileService.upsert(req.params.channelId, req.user!.userId, req.body)
    res.json(profile)
  },
}

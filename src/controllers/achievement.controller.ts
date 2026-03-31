import { Request, Response } from 'express'
import { achievementService } from '../services/achievement.service'

export const achievementController = {
  async getAll(req: Request, res: Response): Promise<void> {
    const achievements = await achievementService.getByUser(req.user!.userId)
    res.json(achievements)
  },

  async check(req: Request, res: Response): Promise<void> {
    const newOnes = await achievementService.checkAndAward(req.user!.userId)
    res.json(newOnes)
  },
}

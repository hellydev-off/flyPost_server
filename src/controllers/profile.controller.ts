import { Request, Response, NextFunction } from 'express'
import { profileService } from '../services/profile.service'

export const profileController = {
  async getProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
    const profile = await profileService.getProfile(req.user!.userId)
    res.json(profile)
  },

  async updateProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
    const { firstName, username } = req.body as {
      firstName?: string
      username?: string
    }
    const profile = await profileService.updateProfile(req.user!.userId, { firstName, username })
    res.json(profile)
  },

  async changePassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    const { currentPassword, newPassword } = req.body as {
      currentPassword: string
      newPassword: string
    }
    await profileService.changePassword(req.user!.userId, currentPassword, newPassword)
    res.json({ message: 'Пароль изменён' })
  },

  async getStats(req: Request, res: Response, next: NextFunction): Promise<void> {
    const stats = await profileService.getUserStats(req.user!.userId)
    res.json(stats)
  },
}

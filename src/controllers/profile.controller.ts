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

  async checkSubscription(req: Request, res: Response, next: NextFunction): Promise<void> {
    const subscribed = await profileService.checkChannelSubscription(req.user!.userId)
    res.json({ subscribed })
  },

  async getPhoto(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const buffer = await profileService.getPhotoBuffer(req.user!.userId)
      res.setHeader('Content-Type', 'image/jpeg')
      res.setHeader('Cache-Control', 'private, max-age=3600')
      res.end(buffer)
    } catch {
      res.status(404).json({ error: 'Фото не найдено' })
    }
  },
}

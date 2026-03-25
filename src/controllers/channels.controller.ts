import { Request, Response, NextFunction } from 'express'
import { channelsService } from '../services/channels.service'

export const channelsController = {
  async getAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    const channels = await channelsService.getChannelsByUser(req.user!.userId)
    res.json(channels)
  },

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    const { telegramChannelId, title, username } = req.body as {
      telegramChannelId: string
      title: string
      username?: string
    }
    const channel = await channelsService.createChannel(req.user!.userId, {
      telegramChannelId,
      title,
      username,
    })
    res.status(201).json(channel)
  },

  async remove(req: Request, res: Response, next: NextFunction): Promise<void> {
    await channelsService.deleteChannel(req.params.id, req.user!.userId)
    res.json({ success: true })
  },
}

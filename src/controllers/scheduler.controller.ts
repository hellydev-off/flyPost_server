import { Request, Response, NextFunction } from 'express'
import { schedulerService } from '../services/scheduler.service'

export const schedulerController = {
  async getAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    const items = await schedulerService.getScheduledPostsByUser(req.user!.userId)
    res.json(items)
  },

  async schedule(req: Request, res: Response, next: NextFunction): Promise<void> {
    const { postId, scheduledAt } = req.body as { postId: string; scheduledAt: string }
    const item = await schedulerService.schedulePost({
      postId,
      scheduledAt: new Date(scheduledAt),
      userId: req.user!.userId,
    })
    res.status(201).json(item)
  },

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    const { scheduledAt } = req.body as { scheduledAt: string }
    const item = await schedulerService.updateScheduledPost(
      req.params.id,
      new Date(scheduledAt),
      req.user!.userId,
    )
    res.json(item)
  },

  async cancel(req: Request, res: Response, next: NextFunction): Promise<void> {
    await schedulerService.cancelScheduledPost(req.params.id, req.user!.userId)
    res.json({ success: true })
  },
}

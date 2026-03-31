import { Request, Response } from 'express'
import { templateService } from '../services/template.service'
import { subscriptionService } from '../services/subscription.service'

export const templateController = {
  async getAll(req: Request, res: Response): Promise<void> {
    const { category } = req.query as { category?: string }
    const templates = await templateService.getAll(req.user!.userId, category)
    res.json(templates)
  },

  async create(req: Request, res: Response): Promise<void> {
    await subscriptionService.assertTemplateLimit(req.user!.userId)
    const template = await templateService.create(req.user!.userId, req.body)
    res.status(201).json(template)
  },

  async update(req: Request, res: Response): Promise<void> {
    const template = await templateService.update(req.params.id, req.user!.userId, req.body)
    res.json(template)
  },

  async remove(req: Request, res: Response): Promise<void> {
    await templateService.delete(req.params.id, req.user!.userId)
    res.json({ success: true })
  },

  async use(req: Request, res: Response): Promise<void> {
    const { variables } = req.body as { variables: Record<string, string> }
    const content = await templateService.use(req.params.id, req.user!.userId, variables ?? {})
    res.json({ content })
  },
}

import { Request, Response, NextFunction } from 'express'
import { postsService } from '../services/posts.service'
import { PostStatus } from '../entities/Post'

export const postsController = {
  async getAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    const { channelId, status } = req.query as { channelId?: string; status?: PostStatus }
    const posts = await postsService.getPostsByUser(req.user!.userId, { channelId, status })
    res.json(posts)
  },

  async getOne(req: Request, res: Response, next: NextFunction): Promise<void> {
    const post = await postsService.getPostById(req.params.id, req.user!.userId)
    res.json(post)
  },

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    const { channelId, content } = req.body as { channelId: string; content: string }
    const post = await postsService.createPost(req.user!.userId, { channelId, content })
    res.status(201).json(post)
  },

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    const { content } = req.body as { content: string }
    const post = await postsService.updatePost(req.params.id, req.user!.userId, content)
    res.json(post)
  },

  async publish(req: Request, res: Response, next: NextFunction): Promise<void> {
    const post = await postsService.publishPost(req.params.id, req.user!.userId)
    res.json(post)
  },

  async remove(req: Request, res: Response, next: NextFunction): Promise<void> {
    await postsService.deletePost(req.params.id, req.user!.userId)
    res.json({ success: true })
  },
}

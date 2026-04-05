import { Request, Response, NextFunction } from 'express'
import { postsService } from '../services/posts.service'
import { PostStatus } from '../entities/Post'
import type { PostButton, PostPoll } from '../entities/Post'

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
    const { channelId, content, buttons, poll, protectContent, pinAfterPublish, disableWebPreview } = req.body as {
      channelId: string
      content: string
      buttons?: PostButton[]
      poll?: PostPoll | null
      protectContent?: boolean
      pinAfterPublish?: boolean
      disableWebPreview?: boolean
    }
    const post = await postsService.createPost(req.user!.userId, { channelId, content, buttons, poll, protectContent, pinAfterPublish, disableWebPreview })
    res.status(201).json(post)
  },

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    const { content, buttons, poll, protectContent, pinAfterPublish, disableWebPreview } = req.body as {
      content: string
      buttons?: PostButton[] | null
      poll?: PostPoll | null
      protectContent?: boolean
      pinAfterPublish?: boolean
      disableWebPreview?: boolean
    }
    const post = await postsService.updatePost(req.params.id, req.user!.userId, { content, buttons, poll, protectContent, pinAfterPublish, disableWebPreview })
    res.json(post)
  },

  async publish(req: Request, res: Response, next: NextFunction): Promise<void> {
    const post = await postsService.publishPost(req.params.id, req.user!.userId)
    res.json(post)
  },

  async attachMedia(req: Request, res: Response, next: NextFunction): Promise<void> {
    const files = req.files as Express.Multer.File[]
    if (!files?.length) {
      res.status(400).json({ error: 'Нет файлов' })
      return
    }
    const post = await postsService.attachMedia(req.params.id, req.user!.userId, files)
    res.json(post)
  },

  async crossPost(req: Request, res: Response, next: NextFunction): Promise<void> {
    const { channelIds } = req.body as { channelIds: string[] }
    const results = await postsService.crossPost(req.params.id, req.user!.userId, channelIds)
    res.json(results)
  },

  async remove(req: Request, res: Response, next: NextFunction): Promise<void> {
    await postsService.deletePost(req.params.id, req.user!.userId)
    res.json({ success: true })
  },
}

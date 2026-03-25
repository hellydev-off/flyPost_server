import { Request, Response, NextFunction } from 'express'
import { grokService } from '../services/grok.service'

export const aiController = {
  async generate(req: Request, res: Response, next: NextFunction): Promise<void> {
    const { topic, tone, length } = req.body as {
      topic: string
      tone: string
      length: 'short' | 'medium' | 'long'
      channelId?: string
    }
    const content = await grokService.generateContent({ topic, tone, length })
    res.json({ content })
  },
}

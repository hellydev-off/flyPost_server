import { Request, Response, NextFunction } from 'express'
import { authService } from '../services/auth.service'

export const authController = {
  async telegram(req: Request, res: Response, next: NextFunction): Promise<void> {
    const { initData } = req.body as { initData: string }
    const result = await authService.authenticateWithTelegram(initData)
    res.json(result)
  },

  async devLogin(req: Request, res: Response, next: NextFunction): Promise<void> {
    const { telegramId, firstName, username } = req.body as {
      telegramId: number
      firstName: string
      username?: string
    }
    const result = await authService.devLogin(telegramId, firstName, username)
    res.json(result)
  },
}

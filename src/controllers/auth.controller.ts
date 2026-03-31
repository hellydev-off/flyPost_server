import { Request, Response, NextFunction } from 'express'
import { authService } from '../services/auth.service'

export const authController = {
  async register(req: Request, res: Response, next: NextFunction): Promise<void> {
    const { email, password, firstName } = req.body as {
      email: string
      password: string
      firstName: string
    }
    const result = await authService.register(email, password, firstName)
    res.status(201).json(result)
  },

  async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    const { email, password } = req.body as { email: string; password: string }
    const result = await authService.login(email, password)
    res.json(result)
  },

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

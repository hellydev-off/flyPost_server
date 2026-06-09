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
    const { initData, utmSource, referralCode } = req.body as { initData: string; utmSource?: string; referralCode?: string }
    const result = await authService.authenticateWithTelegram(initData, utmSource, referralCode)
    res.json(result)
  },

  async adminImpersonate(req: Request, res: Response, next: NextFunction): Promise<void> {
    const { userId, superPassword } = req.body as { userId: string; superPassword: string }
    const result = await authService.adminImpersonate(userId, superPassword)
    res.json(result)
  },

  async devLogin(req: Request, res: Response, next: NextFunction): Promise<void> {
    const { username } = req.body as { username: string }
    const result = await authService.devLogin(username)
    res.json(result)
  },
}

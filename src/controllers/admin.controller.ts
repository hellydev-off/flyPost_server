import { Request, Response, NextFunction } from 'express'
import { adminService } from '../services/admin.service'

export const adminController = {
  async getStats(req: Request, res: Response, next: NextFunction): Promise<void> {
    const data = await adminService.getStats()
    res.json(data)
  },

  async getUsers(req: Request, res: Response, next: NextFunction): Promise<void> {
    const page = parseInt(String(req.query.page ?? '1'))
    const limit = parseInt(String(req.query.limit ?? '20'))
    const search = String(req.query.search ?? '')
    const data = await adminService.getUsers(page, limit, search)
    res.json(data)
  },

  async getSubscriptions(req: Request, res: Response, next: NextFunction): Promise<void> {
    const page = parseInt(String(req.query.page ?? '1'))
    const limit = parseInt(String(req.query.limit ?? '20'))
    const plan = String(req.query.plan ?? '')
    const data = await adminService.getSubscriptions(page, limit, plan)
    res.json(data)
  },

  async upgradePlan(req: Request, res: Response, next: NextFunction): Promise<void> {
    const { userId, plan, months } = req.body as { userId: string; plan: string; months: number }
    const data = await adminService.upgradePlan(userId, plan, months ?? 1)
    res.json(data)
  },

  async getAiUsage(req: Request, res: Response, next: NextFunction): Promise<void> {
    const now = new Date()
    const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const month = String(req.query.month ?? defaultMonth)
    const page = parseInt(String(req.query.page ?? '1'))
    const limit = parseInt(String(req.query.limit ?? '20'))
    const data = await adminService.getAiUsage(month, page, limit)
    res.json(data)
  },

  async getLogs(req: Request, res: Response, next: NextFunction): Promise<void> {
    const page = parseInt(String(req.query.page ?? '1'))
    const limit = parseInt(String(req.query.limit ?? '50'))
    const search = String(req.query.search ?? '')
    const action = String(req.query.action ?? '')
    const data = await adminService.getLogs(page, limit, search, action)
    res.json(data)
  },

  async getChannels(req: Request, res: Response, next: NextFunction): Promise<void> {
    const page = parseInt(String(req.query.page ?? '1'))
    const limit = parseInt(String(req.query.limit ?? '20'))
    const search = String(req.query.search ?? '')
    const data = await adminService.getChannels(page, limit, search)
    res.json(data)
  },
}

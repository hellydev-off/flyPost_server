import { Request, Response, NextFunction } from 'express'
import { subscriptionService } from '../services/subscription.service'
import { PlanKey } from '../entities/UserSubscription'

export const subscriptionController = {
  async getStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    const status = await subscriptionService.getStatus(req.user!.userId)
    res.json(status)
  },

  async initPayment(req: Request, res: Response, next: NextFunction): Promise<void> {
    const { plan, months } = req.body as {
      plan: Exclude<PlanKey, 'free'>
      months: 1 | 3 | 6 | 12
    }
    const result = await subscriptionService.initPayment(req.user!.userId, plan, months)
    res.json(result)
  },

  /** Webhook от ЮKassa — без авторизации, верификация через повторный запрос к API ЮKassa */
  async yookassaWebhook(req: Request, res: Response, next: NextFunction): Promise<void> {
    const body = req.body as {
      type?: string
      object?: { id?: string }
    }

    // ЮKassa шлёт события типа payment.succeeded, payment.canceled и т.д.
    if (body.type === 'notification' && body.object?.id) {
      await subscriptionService.handleYookassaWebhook(body.object.id)
    }

    // Всегда отвечаем 200 — иначе ЮKassa будет повторять запросы
    res.sendStatus(200)
  },

  /** Stub: ручное подтверждение для dev/mock-режима */
  async confirmPayment(req: Request, res: Response, next: NextFunction): Promise<void> {
    const { plan, months } = req.body as {
      plan: Exclude<PlanKey, 'free'>
      months: 1 | 3 | 6 | 12
    }
    await subscriptionService.activatePlan(req.user!.userId, plan, months)
    const status = await subscriptionService.getStatus(req.user!.userId)
    res.json(status)
  },

  async downgradeFree(req: Request, res: Response, next: NextFunction): Promise<void> {
    await subscriptionService.downgradeFree(req.user!.userId)
    const status = await subscriptionService.getStatus(req.user!.userId)
    res.json(status)
  },
}

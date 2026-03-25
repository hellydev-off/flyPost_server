import { Router } from 'express'
import { analyticsController } from '../controllers/analytics.controller'
import { authMiddleware } from '../middleware/auth.middleware'

const router = Router()

router.use(authMiddleware)

router.get('/:channelId', analyticsController.getChannelAnalytics)

export default router

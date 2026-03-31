import { Router } from 'express'
import { analyticsController } from '../controllers/analytics.controller'
import { authMiddleware } from '../middleware/auth.middleware'

const router = Router()

router.use(authMiddleware)

router.get('/:channelId', analyticsController.getChannelAnalytics)
router.get('/:channelId/insights', analyticsController.getAiInsights)
router.get('/:channelId/subscribers', analyticsController.getSubscriberHistory)
router.get('/:channelId/best-time', analyticsController.getBestTime)
router.get('/:channelId/health-score', analyticsController.getHealthScore)
router.get('/:channelId/streak', analyticsController.getStreak)

export default router

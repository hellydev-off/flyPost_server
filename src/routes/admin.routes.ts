import { Router } from 'express'
import { adminMiddleware } from '../middleware/admin.middleware'
import { adminController } from '../controllers/admin.controller'

const router = Router()

router.use(adminMiddleware)

router.get('/stats', adminController.getStats)
router.get('/users', adminController.getUsers)
router.get('/subscriptions', adminController.getSubscriptions)
router.post('/subscriptions/upgrade', adminController.upgradePlan)
router.get('/ai-usage', adminController.getAiUsage)
router.get('/channels', adminController.getChannels)
router.get('/logs', adminController.getLogs)

export default router

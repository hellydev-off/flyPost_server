import { Router } from 'express'
import { subscriptionController } from '../controllers/subscription.controller'
import { authMiddleware } from '../middleware/auth.middleware'

const router = Router()

// Webhook от ЮKassa — без авторизации (ЮKassa обращается с серверов, не в контексте пользователя)
router.post('/webhook/yookassa', subscriptionController.yookassaWebhook)

router.use(authMiddleware)

router.get('/status', subscriptionController.getStatus)
router.post('/payment/init', subscriptionController.initPayment)
router.post('/payment/confirm', subscriptionController.confirmPayment)
router.post('/downgrade-free', subscriptionController.downgradeFree)

export default router

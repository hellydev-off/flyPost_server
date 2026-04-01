import { Router } from 'express'
import { aiController } from '../controllers/ai.controller'
import { authMiddleware } from '../middleware/auth.middleware'

const router = Router()

router.use(authMiddleware)

router.post('/generate', aiController.generate)
router.post('/improve', aiController.improve)
router.post('/daily-plan', aiController.dailyPlan)
router.post('/weekly-plan', aiController.weeklyPlan)
router.get('/plans', aiController.getPlans)

export default router

import { Router } from 'express'
import { achievementController } from '../controllers/achievement.controller'
import { authMiddleware } from '../middleware/auth.middleware'

const router = Router()

router.use(authMiddleware)

router.get('/', achievementController.getAll)
router.post('/check', achievementController.check)

export default router

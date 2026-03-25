import { Router } from 'express'
import { aiController } from '../controllers/ai.controller'
import { authMiddleware } from '../middleware/auth.middleware'

const router = Router()

router.use(authMiddleware)

router.post('/generate', aiController.generate)

export default router

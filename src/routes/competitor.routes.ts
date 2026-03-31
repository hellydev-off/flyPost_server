import { Router } from 'express'
import { competitorController } from '../controllers/competitor.controller'
import { authMiddleware } from '../middleware/auth.middleware'

const router = Router()

router.use(authMiddleware)

router.get('/', competitorController.getAll)
router.post('/', competitorController.add)
router.delete('/:id', competitorController.delete)
router.post('/:id/analyze', competitorController.analyze)

export default router

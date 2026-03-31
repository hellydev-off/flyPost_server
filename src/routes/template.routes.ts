import { Router } from 'express'
import { templateController } from '../controllers/template.controller'
import { authMiddleware } from '../middleware/auth.middleware'

const router = Router()

router.use(authMiddleware)

router.get('/', templateController.getAll)
router.post('/', templateController.create)
router.patch('/:id', templateController.update)
router.delete('/:id', templateController.remove)
router.post('/:id/use', templateController.use)

export default router

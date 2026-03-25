import { Router } from 'express'
import { schedulerController } from '../controllers/scheduler.controller'
import { authMiddleware } from '../middleware/auth.middleware'

const router = Router()

router.use(authMiddleware)

router.get('/', schedulerController.getAll)
router.post('/', schedulerController.schedule)
router.put('/:id', schedulerController.update)
router.delete('/:id', schedulerController.cancel)

export default router

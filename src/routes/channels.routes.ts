import { Router } from 'express'
import { channelsController } from '../controllers/channels.controller'
import { authMiddleware } from '../middleware/auth.middleware'

const router = Router()

router.use(authMiddleware)

router.get('/', channelsController.getAll)
router.post('/', channelsController.create)
router.delete('/:id', channelsController.remove)

export default router

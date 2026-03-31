import { Router } from 'express'
import { channelsController } from '../controllers/channels.controller'
import { channelProfileController } from '../controllers/channelProfile.controller'
import { authMiddleware } from '../middleware/auth.middleware'

const router = Router()

router.use(authMiddleware)

router.get('/', channelsController.getAll)
router.post('/', channelsController.create)
router.delete('/:id', channelsController.remove)

router.get('/:channelId/profile', channelProfileController.get)
router.put('/:channelId/profile', channelProfileController.upsert)

export default router

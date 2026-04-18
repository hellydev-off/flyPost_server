import { Router } from 'express'
import { profileController } from '../controllers/profile.controller'
import { authMiddleware } from '../middleware/auth.middleware'

const router = Router()

router.use(authMiddleware)

router.get('/', profileController.getProfile)
router.patch('/', profileController.updateProfile)
router.post('/change-password', profileController.changePassword)
router.get('/stats', profileController.getStats)
router.get('/photo', profileController.getPhoto)

export default router

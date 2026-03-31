import { Router } from 'express'
import { authController } from '../controllers/auth.controller'

const router = Router()

router.post('/register', authController.register)
router.post('/login', authController.login)
router.post('/telegram', authController.telegram)

if (process.env.NODE_ENV !== 'production') {
  router.post('/dev-login', authController.devLogin)
}

export default router

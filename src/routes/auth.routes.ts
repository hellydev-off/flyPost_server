import { Router } from 'express'
import { authController } from '../controllers/auth.controller'

const router = Router()

router.post('/telegram', authController.telegram)

// Dev-only endpoint: обход Telegram валидации для локального тестирования
if (process.env.NODE_ENV !== 'production') {
  router.post('/dev-login', authController.devLogin)
}

export default router

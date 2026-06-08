import { Router } from 'express'
import { newsController } from '../controllers/news.controller'
import { authMiddleware } from '../middleware/auth.middleware'

const router = Router()

router.use(authMiddleware)

router.get('/', newsController.getNews)
router.get('/categories', newsController.getCategories)
router.get('/sources', newsController.getSources)

export default router

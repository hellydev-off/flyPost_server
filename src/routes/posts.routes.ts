import { Router } from 'express'
import { postsController } from '../controllers/posts.controller'
import { authMiddleware } from '../middleware/auth.middleware'
import { uploadMiddleware } from '../middleware/upload.middleware'

const router = Router()

router.use(authMiddleware)

router.get('/', postsController.getAll)
router.get('/:id', postsController.getOne)
router.post('/', postsController.create)
router.put('/:id', postsController.update)
router.post('/:id/publish', postsController.publish)
router.post('/:id/crosspost', postsController.crossPost)
router.post('/:id/media', uploadMiddleware, postsController.attachMedia)
router.delete('/:id', postsController.remove)

export default router

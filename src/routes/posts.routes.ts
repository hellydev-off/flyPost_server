import { Router } from 'express'
import { postsController } from '../controllers/posts.controller'
import { authMiddleware } from '../middleware/auth.middleware'

const router = Router()

router.use(authMiddleware)

router.get('/', postsController.getAll)
router.get('/:id', postsController.getOne)
router.post('/', postsController.create)
router.put('/:id', postsController.update)
router.post('/:id/publish', postsController.publish)
router.delete('/:id', postsController.remove)

export default router

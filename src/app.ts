import 'dotenv/config'
import 'reflect-metadata'
import 'express-async-errors'

import express from 'express'
import cors from 'cors'
import helmet from 'helmet'

import { AppDataSource } from './config/database'
import { errorMiddleware } from './middleware/error.middleware'
import { loggerMiddleware } from './middleware/logger.middleware'
import { isMockMode } from './utils/mockMode'

import authRoutes from './routes/auth.routes'
import channelsRoutes from './routes/channels.routes'
import postsRoutes from './routes/posts.routes'
import schedulerRoutes from './routes/scheduler.routes'
import aiRoutes from './routes/ai.routes'
import analyticsRoutes from './routes/analytics.routes'
import profileRoutes from './routes/profile.routes'
import competitorRoutes from './routes/competitor.routes'
import templateRoutes from './routes/template.routes'
import achievementRoutes from './routes/achievement.routes'
import subscriptionRoutes from './routes/subscription.routes'
import adminRoutes from './routes/admin.routes'

import { schedulerService } from './services/scheduler.service'
import { statsCollectorService } from './services/statsCollector.service'

const app = express()
const PORT = process.env.PORT || 3000

// --- Middleware ---
app.use(cors({
  origin: true,
  credentials: true,
}))
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}))
app.use(express.json())
app.use('/uploads', express.static('uploads'))
app.use(loggerMiddleware)

// --- Routes ---
app.use('/api/auth', authRoutes)
app.use('/api/channels', channelsRoutes)
app.use('/api/posts', postsRoutes)
app.use('/api/scheduler', schedulerRoutes)
app.use('/api/ai', aiRoutes)
app.use('/api/analytics', analyticsRoutes)
app.use('/api/profile', profileRoutes)
app.use('/api/competitors', competitorRoutes)
app.use('/api/templates', templateRoutes)
app.use('/api/achievements', achievementRoutes)
app.use('/api/subscription', subscriptionRoutes)
app.use('/api/admin', adminRoutes)

// --- Error handler (должен быть последним) ---
app.use(errorMiddleware)

// --- Bootstrap ---
async function bootstrap(): Promise<void> {
  await AppDataSource.initialize()
  console.log('[DB] PostgreSQL connected')

  schedulerService.initialize()
  statsCollectorService.initialize()

  if (!isMockMode) {
    const { startBot } = await import('./bot/bot')
    startBot()
  }

  app.listen(PORT, () => {
    console.log(`[APP] Server running on http://localhost:${PORT}`)
    console.log(`[APP] Mock mode: ${isMockMode}`)
  })
}

bootstrap().catch((err) => {
  console.error('[APP] Fatal startup error:', err)
  process.exit(1)
})

export default app

import 'dotenv/config'
import 'reflect-metadata'
import 'express-async-errors'

import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'

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
import { auditService } from './services/audit.service'
import { statsCollectorService } from './services/statsCollector.service'

function validateEnv(): void {
  // Поддерживаем оба варианта названия переменной пароля БД
  const hasDbPass = !!(process.env.DB_PASS || process.env.DB_PASSWORD)
  const required = isMockMode
    ? ['JWT_SECRET', 'DB_HOST', 'DB_USER', 'DB_NAME']
    : ['JWT_SECRET', 'DB_HOST', 'DB_USER', 'DB_NAME', 'TELEGRAM_BOT_TOKEN', 'GROK_API_KEY']
  const missing = required.filter(key => !process.env[key])
  if (!hasDbPass) missing.push('DB_PASS / DB_PASSWORD')
  if (missing.length) {
    throw new Error(`[APP] Отсутствуют обязательные переменные окружения: ${missing.join(', ')}`)
  }
}

const app = express()
const PORT = process.env.PORT || 3000

// --- Middleware ---
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173,https://app.neo-post.ru').split(',').map(o => o.trim())
app.use(cors({
  origin: (origin, callback) => {
    // Разрешаем запросы без origin (мобильные, Postman, server-to-server) и из allowed list
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true)
    } else {
      // callback(null, false) — правильный способ отклонить, не бросать ошибку
      callback(null, false)
    }
  },
  credentials: true,
}))
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}))
app.use(express.json())
app.use('/uploads', express.static('uploads'))
app.use(loggerMiddleware)

// --- Rate limiting ---
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 минут
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Слишком много запросов. Попробуйте через 15 минут.' },
})

const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 минута
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  // Используем дефолтный keyGenerator чтобы избежать ERR_ERL_KEY_GEN_IPV6
  validate: { xForwardedForHeader: false },
  message: { message: 'Слишком много запросов. Подождите немного.' },
})

app.use('/api/auth', authLimiter)
app.use('/api/', apiLimiter)

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
  validateEnv()

  await AppDataSource.initialize()
  console.log('[DB] PostgreSQL connected')

  schedulerService.initialize()
  statsCollectorService.initialize()

  if (!isMockMode) {
    const { startBot } = await import('./bot/bot')
    startBot()
  }

  auditService.startPolling()

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

import { Request, Response, NextFunction } from 'express'
import { AppDataSource } from '../config/database'
import { ActionLog } from '../entities/ActionLog'
import { User } from '../entities/User'

// Человекочитаемое описание действия по методу + пути
function describeAction(method: string, path: string): string {
  const m = method.toUpperCase()
  const p = path.replace(/\/[0-9a-f-]{36}/gi, '/:id')

  const map: Record<string, string> = {
    'POST /api/auth/register': 'Регистрация',
    'POST /api/auth/login': 'Вход',
    'POST /api/auth/telegram': 'Вход через Telegram',
    'POST /api/auth/dev-login': 'Dev-вход',
    'POST /api/posts': 'Создание поста',
    'PUT /api/posts/:id': 'Обновление поста',
    'DELETE /api/posts/:id': 'Удаление поста',
    'POST /api/posts/:id/publish': 'Публикация поста',
    'POST /api/posts/:id/crosspost': 'Кросс-постинг',
    'POST /api/channels': 'Добавление канала',
    'DELETE /api/channels/:id': 'Удаление канала',
    'POST /api/scheduler': 'Планирование поста',
    'PUT /api/scheduler/:id': 'Изменение расписания',
    'DELETE /api/scheduler/:id': 'Отмена расписания',
    'POST /api/ai/generate': 'AI генерация',
    'POST /api/ai/improve': 'AI улучшение',
    'POST /api/ai/daily-plan': 'AI дневной план',
    'POST /api/ai/weekly-plan': 'AI недельный план',
    'POST /api/templates': 'Создание шаблона',
    'DELETE /api/templates/:id': 'Удаление шаблона',
    'POST /api/competitors': 'Добавление конкурента',
    'POST /api/competitors/:id/analyze': 'Анализ конкурента',
    'DELETE /api/competitors/:id': 'Удаление конкурента',
    'POST /api/subscription/payment/init': 'Инициализация платежа',
    'PATCH /api/profile': 'Обновление профиля',
    'POST /api/profile/change-password': 'Смена пароля',
  }

  const key = `${m} ${p}`
  return map[key] ?? `${m} ${p}`
}

// Список путей которые НЕ логируем (GET запросы на чтение)
const SKIP_PATHS = [
  '/api/posts',
  '/api/channels',
  '/api/profile',
  '/api/analytics',
  '/api/achievements',
  '/api/subscription/status',
  '/api/scheduler',
  '/api/templates',
  '/api/competitors',
  '/api/ai/plans',
  '/api/admin/stats',
  '/api/admin/users',
  '/api/admin/channels',
  '/api/admin/subscriptions',
  '/api/admin/ai-usage',
  '/api/admin/logs',
]

function shouldSkip(method: string, path: string): boolean {
  if (method === 'GET') {
    return SKIP_PATHS.some(p => path.startsWith(p))
  }
  return false
}

export function loggerMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (shouldSkip(req.method, req.path)) {
    next()
    return
  }

  const start = Date.now()

  res.on('finish', () => {
    // fire-and-forget, не блокируем ответ
    setImmediate(async () => {
      try {
        if (!AppDataSource.isInitialized) return

        const userId = req.user?.userId ?? null
        let userEmail: string | null = null

        if (userId) {
          const user = await AppDataSource.getRepository(User).findOne({
            where: { id: userId },
            select: ['email'],
          })
          userEmail = user?.email ?? null
        }

        const log = AppDataSource.getRepository(ActionLog).create({
          userId,
          userEmail,
          method: req.method,
          path: req.path,
          action: describeAction(req.method, req.path),
          statusCode: res.statusCode,
          durationMs: Date.now() - start,
          ip: (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ?? req.socket.remoteAddress ?? null,
          meta: buildMeta(req),
        })

        await AppDataSource.getRepository(ActionLog).save(log)
      } catch {
        // логирование не должно ломать приложение
      }
    })
  })

  next()
}

function buildMeta(req: Request): object | null {
  const sensitive = new Set(['password', 'passwordHash', 'token', 'superPassword', 'currentPassword', 'newPassword'])
  const body = req.body as Record<string, unknown>
  if (!body || typeof body !== 'object') return null

  const safe: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(body)) {
    if (sensitive.has(k)) safe[k] = '[hidden]'
    else safe[k] = v
  }

  // Добавляем params если есть
  if (req.params && Object.keys(req.params).length) {
    safe._params = req.params
  }

  return Object.keys(safe).length ? safe : null
}

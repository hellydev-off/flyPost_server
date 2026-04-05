import { AppDataSource } from '../config/database'
import { User } from '../entities/User'
import { isMockMode } from '../utils/mockMode'

type NotificationType =
  | 'post_published'
  | 'post_scheduled'
  | 'post_failed'
  | 'subscriber_milestone'
  | 'achievement_unlocked'

interface NotifyOptions {
  userId: string
  type: NotificationType
  data?: Record<string, string | number>
}

const MESSAGES: Record<NotificationType, (d: Record<string, string | number>) => string> = {
  post_published: (d) =>
    `✅ Пост опубликован в *${d.channelTitle}*\n\n_${String(d.preview ?? '').slice(0, 100)}${String(d.preview ?? '').length > 100 ? '…' : ''}_`,

  post_scheduled: (d) =>
    `🕐 Пост запланирован в *${d.channelTitle}*\nПубликация: *${d.scheduledAt}*`,

  post_failed: (d) =>
    `❌ Не удалось опубликовать пост в *${d.channelTitle}*\nПроверь, что бот является администратором канала.`,

  subscriber_milestone: (d) =>
    `🎉 Поздравляем! Канал *${d.channelTitle}* достиг *${d.count}* подписчиков!`,

  achievement_unlocked: (d) =>
    `🏆 Новое достижение разблокировано: *${d.title}*\n${d.description ?? ''}`,
}

const ACHIEVEMENT_LABELS: Record<string, { title: string; description: string }> = {
  first_post:       { title: 'Первый пост', description: 'Ты создал свой первый пост!' },
  posts_10:         { title: '10 публикаций', description: 'Уже 10 опубликованных постов — отличный старт!' },
  posts_50:         { title: '50 публикаций', description: 'Ты настоящий контент-мейкер!' },
  first_scheduled:  { title: 'Планировщик', description: 'Ты впервые запланировал пост' },
  streak_30:        { title: 'Марафонец', description: '30 дней подряд с публикациями!' },
  subs_1000:        { title: '1000 подписчиков', description: 'Твой канал достиг 1000 подписчиков!' },
}

class NotificationService {
  private get userRepo() {
    return AppDataSource.getRepository(User)
  }

  async notify(opts: NotifyOptions): Promise<void> {
    if (isMockMode) {
      console.log(`[MOCK NOTIFY] type=${opts.type} userId=${opts.userId}`, opts.data)
      return
    }

    try {
      const user = await this.userRepo.findOne({ where: { id: opts.userId } })
      if (!user?.telegramId) return  // нет Telegram — нечего отправлять

      const data = opts.data ?? {}
      const text = MESSAGES[opts.type]?.(data)
      if (!text) return

      // Импорт bot чтобы избежать circular dependency при старте
      const { bot } = await import('../bot/bot')
      await bot.sendMessage(user.telegramId, text, { parse_mode: 'Markdown' })
    } catch (err) {
      // уведомления не должны ломать бизнес-логику
      console.error('[NOTIFY] Failed to send notification:', err)
    }
  }

  async notifyAchievement(userId: string, achievementType: string): Promise<void> {
    const label = ACHIEVEMENT_LABELS[achievementType]
    if (!label) return
    await this.notify({
      userId,
      type: 'achievement_unlocked',
      data: { title: label.title, description: label.description },
    })
  }
}

export const notificationService = new NotificationService()

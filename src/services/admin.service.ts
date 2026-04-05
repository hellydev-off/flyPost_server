import { AppDataSource } from '../config/database'
import { User } from '../entities/User'
import { Channel } from '../entities/Channel'
import { Post } from '../entities/Post'
import { UserSubscription } from '../entities/UserSubscription'
import { UsageLog } from '../entities/UsageLog'
import { ActionLog } from '../entities/ActionLog'

class AdminService {
  // ─── Dashboard ───────────────────────────────────────────────

  async getStats(): Promise<object> {
    const userRepo = AppDataSource.getRepository(User)
    const channelRepo = AppDataSource.getRepository(Channel)
    const postRepo = AppDataSource.getRepository(Post)
    const subRepo = AppDataSource.getRepository(UserSubscription)

    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const weekStart = new Date(todayStart)
    weekStart.setDate(weekStart.getDate() - 7)
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

    const [
      totalUsers,
      totalChannels,
      totalPosts,
      publishedPosts,
      usersToday,
      usersWeek,
      usersMonth,
    ] = await Promise.all([
      userRepo.count(),
      channelRepo.count(),
      postRepo.count(),
      postRepo.count({ where: { status: 'published' } }),
      userRepo.createQueryBuilder('u').where('u.createdAt >= :d', { d: todayStart }).getCount(),
      userRepo.createQueryBuilder('u').where('u.createdAt >= :d', { d: weekStart }).getCount(),
      userRepo.createQueryBuilder('u').where('u.createdAt >= :d', { d: monthStart }).getCount(),
    ])

    // Распределение по планам
    const planRows = await subRepo
      .createQueryBuilder('s')
      .select('s.plan', 'plan')
      .addSelect('COUNT(*)', 'count')
      .groupBy('s.plan')
      .getRawMany<{ plan: string; count: string }>()

    const planStats: Record<string, number> = { free: 0, start: 0, pro: 0, max: 0 }
    for (const r of planRows) planStats[r.plan] = parseInt(r.count)

    // Триалы
    const trialsActive = await subRepo
      .createQueryBuilder('s')
      .where('s.trialEndsAt > :now', { now })
      .getCount()

    // AI генерации за текущий месяц
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const aiRow = await AppDataSource.getRepository(UsageLog)
      .createQueryBuilder('u')
      .select('SUM(u.aiGenerations)', 'total')
      .where('u.month = :m', { m: currentMonth })
      .getRawOne<{ total: string }>()
    const aiGenerationsMonth = parseInt(aiRow?.total ?? '0') || 0

    // Новые пользователи по дням за последние 30 дней
    const growthRows = await userRepo
      .createQueryBuilder('u')
      .select("TO_CHAR(u.createdAt, 'YYYY-MM-DD')", 'date')
      .addSelect('COUNT(*)', 'count')
      .where('u.createdAt >= :d', { d: monthStart })
      .groupBy("TO_CHAR(u.createdAt, 'YYYY-MM-DD')")
      .orderBy("TO_CHAR(u.createdAt, 'YYYY-MM-DD')", 'ASC')
      .getRawMany<{ date: string; count: string }>()

    const userGrowth = growthRows.map(r => ({ date: r.date, count: parseInt(r.count) }))

    return {
      totalUsers,
      totalChannels,
      totalPosts,
      publishedPosts,
      usersToday,
      usersWeek,
      usersMonth,
      planStats,
      trialsActive,
      aiGenerationsMonth,
      userGrowth,
    }
  }

  // ─── Users ────────────────────────────────────────────────────

  async getUsers(page: number, limit: number, search: string): Promise<object> {
    const userRepo = AppDataSource.getRepository(User)

    const qb = userRepo
      .createQueryBuilder('u')
      .orderBy('u.createdAt', 'DESC')

    if (search) {
      qb.where(
        'u.firstName ILIKE :s OR u.email ILIKE :s OR u.username ILIKE :s',
        { s: `%${search}%` },
      )
    }

    const total = await qb.getCount()
    const users = await qb.skip((page - 1) * limit).take(limit).getMany()

    const userIds = users.map(u => u.id)

    // Подписки для этих юзеров
    const subs = userIds.length
      ? await AppDataSource.getRepository(UserSubscription)
          .createQueryBuilder('s')
          .where('s.userId IN (:...ids)', { ids: userIds })
          .getMany()
      : []
    const subMap = new Map(subs.map(s => [s.userId, s]))

    // Количество каналов и постов
    const channelCounts: { userId: string; count: string }[] = userIds.length
      ? await AppDataSource.getRepository(Channel)
          .createQueryBuilder('c')
          .select('c.userId', 'userId')
          .addSelect('COUNT(*)', 'count')
          .where('c.userId IN (:...ids)', { ids: userIds })
          .groupBy('c.userId')
          .getRawMany()
      : []
    const channelCountMap = new Map(channelCounts.map(r => [r.userId, parseInt(r.count)]))

    const postCounts: { userId: string; count: string }[] = userIds.length
      ? await AppDataSource.getRepository(Post)
          .createQueryBuilder('p')
          .select('p.userId', 'userId')
          .addSelect('COUNT(*)', 'count')
          .where('p.userId IN (:...ids)', { ids: userIds })
          .groupBy('p.userId')
          .getRawMany()
      : []
    const postCountMap = new Map(postCounts.map(r => [r.userId, parseInt(r.count)]))

    const rows = users.map(u => {
      const sub = subMap.get(u.id)
      const now = new Date()
      let effectivePlan: string = sub?.plan ?? 'free'
      if (sub?.trialEndsAt && sub.trialEndsAt > now) effectivePlan = 'trial'

      return {
        id: u.id,
        firstName: u.firstName,
        email: u.email,
        username: u.username,
        telegramId: u.telegramId,
        createdAt: u.createdAt,
        plan: sub?.plan ?? 'free',
        effectivePlan,
        trialEndsAt: sub?.trialEndsAt ?? null,
        subscriptionEndsAt: sub?.subscriptionEndsAt ?? null,
        channels: channelCountMap.get(u.id) ?? 0,
        posts: postCountMap.get(u.id) ?? 0,
      }
    })

    return { total, page, limit, rows }
  }

  // ─── Subscriptions ────────────────────────────────────────────

  async getSubscriptions(page: number, limit: number, plan: string): Promise<object> {
    const subRepo = AppDataSource.getRepository(UserSubscription)
    const userRepo = AppDataSource.getRepository(User)

    const qb = subRepo
      .createQueryBuilder('s')
      .orderBy('s.updatedAt', 'DESC')

    if (plan) qb.where('s.plan = :plan', { plan })

    const total = await qb.getCount()
    const subs = await qb.skip((page - 1) * limit).take(limit).getMany()

    const userIds = subs.map(s => s.userId)
    const users = userIds.length
      ? await userRepo
          .createQueryBuilder('u')
          .where('u.id IN (:...ids)', { ids: userIds })
          .getMany()
      : []
    const userMap = new Map(users.map(u => [u.id, u]))

    const now = new Date()
    const rows = subs.map(s => {
      const u = userMap.get(s.userId)
      let effectivePlan = s.plan
      if (s.trialEndsAt && s.trialEndsAt > now) effectivePlan = 'max' as any
      const trialDaysLeft = s.trialEndsAt
        ? Math.max(0, Math.ceil((s.trialEndsAt.getTime() - now.getTime()) / 86400000))
        : null

      return {
        id: s.id,
        userId: s.userId,
        firstName: u?.firstName ?? '—',
        email: u?.email ?? '—',
        plan: s.plan,
        effectivePlan,
        isTrial: !!(s.trialEndsAt && s.trialEndsAt > now),
        trialDaysLeft,
        trialEndsAt: s.trialEndsAt,
        subscriptionEndsAt: s.subscriptionEndsAt,
        updatedAt: s.updatedAt,
      }
    })

    return { total, page, limit, rows }
  }

  async upgradePlan(userId: string, plan: string, months: number): Promise<object> {
    const { subscriptionService } = await import('./subscription.service')
    const sub = await subscriptionService.activatePlan(userId, plan as any, months)
    return sub
  }

  // ─── AI Usage ─────────────────────────────────────────────────

  async getAiUsage(month: string, page: number, limit: number): Promise<object> {
    const logRepo = AppDataSource.getRepository(UsageLog)
    const userRepo = AppDataSource.getRepository(User)

    const qb = logRepo
      .createQueryBuilder('l')
      .where('l.month = :month', { month })
      .orderBy('l.aiGenerations', 'DESC')

    const total = await qb.getCount()
    const logs = await qb.skip((page - 1) * limit).take(limit).getMany()

    const userIds = logs.map(l => l.userId)
    const users = userIds.length
      ? await userRepo
          .createQueryBuilder('u')
          .where('u.id IN (:...ids)', { ids: userIds })
          .getMany()
      : []
    const userMap = new Map(users.map(u => [u.id, u]))

    // Топ по всем месяцам
    const topAllTime = await logRepo
      .createQueryBuilder('l')
      .select('l.userId', 'userId')
      .addSelect('SUM(l.aiGenerations)', 'total')
      .groupBy('l.userId')
      .orderBy('SUM(l.aiGenerations)', 'DESC')
      .limit(5)
      .getRawMany<{ userId: string; total: string }>()

    const topUserIds = topAllTime.map(r => r.userId)
    const topUsers = topUserIds.length
      ? await userRepo.createQueryBuilder('u').where('u.id IN (:...ids)', { ids: topUserIds }).getMany()
      : []
    const topUserMap = new Map(topUsers.map(u => [u.id, u]))

    const rows = logs.map(l => ({
      userId: l.userId,
      firstName: userMap.get(l.userId)?.firstName ?? '—',
      email: userMap.get(l.userId)?.email ?? '—',
      month: l.month,
      aiGenerations: l.aiGenerations,
    }))

    const topUsersResult = topAllTime.map(r => ({
      userId: r.userId,
      firstName: topUserMap.get(r.userId)?.firstName ?? '—',
      total: parseInt(r.total),
    }))

    return { total, page, limit, rows, topUsers: topUsersResult }
  }

  // ─── Channels ────────────────────────────────────────────────

  async getChannels(page: number, limit: number, search: string): Promise<object> {
    const channelRepo = AppDataSource.getRepository(Channel)
    const userRepo = AppDataSource.getRepository(User)

    const qb = channelRepo
      .createQueryBuilder('c')
      .orderBy('c.createdAt', 'DESC')

    if (search) {
      qb.where('c.title ILIKE :s OR c.username ILIKE :s', { s: `%${search}%` })
    }

    const total = await qb.getCount()
    const channels = await qb.skip((page - 1) * limit).take(limit).getMany()

    const userIds = [...new Set(channels.map(c => (c as any).userId).filter(Boolean))]

    // Загрузим userId через raw query
    const channelIds = channels.map(c => c.id)
    const raw: { id: string; userId: string }[] = channelIds.length
      ? await channelRepo
          .createQueryBuilder('c')
          .select('c.id', 'id')
          .addSelect('c.userId', 'userId')
          .where('c.id IN (:...ids)', { ids: channelIds })
          .getRawMany()
      : []
    const channelUserMap = new Map(raw.map(r => [r.id, r.userId]))

    const allUserIds = [...new Set(raw.map(r => r.userId).filter(Boolean))]
    const users = allUserIds.length
      ? await userRepo.createQueryBuilder('u').where('u.id IN (:...ids)', { ids: allUserIds }).getMany()
      : []
    const userMap = new Map(users.map(u => [u.id, u]))

    const postCounts: { channelId: string; count: string }[] = channelIds.length
      ? await AppDataSource.getRepository(Post)
          .createQueryBuilder('p')
          .select('p.channelId', 'channelId')
          .addSelect('COUNT(*)', 'count')
          .where('p.channelId IN (:...ids)', { ids: channelIds })
          .groupBy('p.channelId')
          .getRawMany()
      : []
    const postCountMap = new Map(postCounts.map(r => [r.channelId, parseInt(r.count)]))

    const rows = channels.map(c => {
      const uid = channelUserMap.get(c.id)
      const u = uid ? userMap.get(uid) : undefined
      return {
        id: c.id,
        title: c.title,
        username: c.username,
        telegramChannelId: c.telegramChannelId,
        botIsAdmin: c.botIsAdmin,
        createdAt: c.createdAt,
        ownerFirstName: u?.firstName ?? '—',
        ownerEmail: u?.email ?? '—',
        posts: postCountMap.get(c.id) ?? 0,
      }
    })

    return { total, page, limit, rows }
  }

  // ─── Action Logs ─────────────────────────────────────────────

  async getLogs(page: number, limit: number, search: string, action: string): Promise<object> {
    const logRepo = AppDataSource.getRepository(ActionLog)

    const qb = logRepo
      .createQueryBuilder('l')
      .orderBy('l.createdAt', 'DESC')

    if (search) {
      qb.where(
        'l.userEmail ILIKE :s OR l.action ILIKE :s OR l.path ILIKE :s',
        { s: `%${search}%` },
      )
    }
    if (action) {
      qb.andWhere('l.action ILIKE :a', { a: `%${action}%` })
    }

    const total = await qb.getCount()
    const logs = await qb.skip((page - 1) * limit).take(limit).getMany()

    // Уникальные действия для фильтра
    const actions = await logRepo
      .createQueryBuilder('l')
      .select('DISTINCT l.action', 'action')
      .orderBy('l.action', 'ASC')
      .getRawMany<{ action: string }>()

    return {
      total,
      page,
      limit,
      rows: logs,
      actions: actions.map(a => a.action),
    }
  }
}

export const adminService = new AdminService()

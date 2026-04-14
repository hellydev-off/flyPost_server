import { AppDataSource } from '../config/database'
import { UserSubscription, PlanKey } from '../entities/UserSubscription'
import { UsageLog } from '../entities/UsageLog'
import { ScheduledPost } from '../entities/ScheduledPost'
import { Template } from '../entities/Template'
import { Channel } from '../entities/Channel'
import { AppError } from '../utils/AppError'

export interface PlanLimits {
  channels: number             // -1 = unlimited
  scheduledPosts: number       // max active pending scheduled posts (-1 = unlimited)
  aiGenerationsPerMonth: number
  templates: number
  fullAnalytics: boolean
  competitors: boolean
  weeklyPlan: boolean
  voiceProfile: boolean
}

export const PLAN_LIMITS: Record<PlanKey, PlanLimits> = {
  free: {
    channels: 1,
    scheduledPosts: 5,
    aiGenerationsPerMonth: 0,
    templates: 0,
    fullAnalytics: false,
    competitors: false,
    weeklyPlan: false,
    voiceProfile: false,
  },
  start: {
    channels: 2,
    scheduledPosts: 20,
    aiGenerationsPerMonth: 15,
    templates: 5,
    fullAnalytics: false,
    competitors: false,
    weeklyPlan: false,
    voiceProfile: false,
  },
  pro: {
    channels: 5,
    scheduledPosts: 60,
    aiGenerationsPerMonth: 50,
    templates: 20,
    fullAnalytics: true,
    competitors: true,
    weeklyPlan: true,
    voiceProfile: true,
  },
  max: {
    channels: -1,
    scheduledPosts: -1,
    aiGenerationsPerMonth: -1,
    templates: -1,
    fullAnalytics: true,
    competitors: true,
    weeklyPlan: true,
    voiceProfile: true,
  },
}

const TRIAL_DAYS = 14

function currentMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

class SubscriptionService {
  private get subRepo() { return AppDataSource.getRepository(UserSubscription) }
  private get usageRepo() { return AppDataSource.getRepository(UsageLog) }
  private get scheduledRepo() { return AppDataSource.getRepository(ScheduledPost) }
  private get templateRepo() { return AppDataSource.getRepository(Template) }
  private get channelRepo() { return AppDataSource.getRepository(Channel) }

  /** Get or create subscription. New users get a 14-day max trial. */
  async getOrCreate(userId: string): Promise<UserSubscription> {
    let sub = await this.subRepo.findOne({ where: { userId } })
    if (!sub) {
      const trialEndsAt = new Date()
      trialEndsAt.setDate(trialEndsAt.getDate() + TRIAL_DAYS)
      sub = this.subRepo.create({
        userId,
        plan: 'free',
        trialEndsAt,
        subscriptionEndsAt: null,
      })
      await this.subRepo.save(sub)
    }
    return sub
  }

  /** Effective plan considering trial and subscription expiry.
   *  Paid subscription takes PRIORITY over trial. */
  getEffectivePlan(sub: UserSubscription): PlanKey {
    const now = new Date()
    // Paid subscription takes priority
    if (sub.subscriptionEndsAt && sub.subscriptionEndsAt > now) {
      return sub.plan
    }
    // Trial → max
    if (sub.trialEndsAt && sub.trialEndsAt > now) {
      return 'max'
    }
    return 'free'
  }

  async getStatus(userId: string) {
    const sub = await this.getOrCreate(userId)
    const effectivePlan = this.getEffectivePlan(sub)
    const limits = PLAN_LIMITS[effectivePlan]
    const month = currentMonth()

    const [aiLog, channelsCount, scheduledCount, templatesCount] = await Promise.all([
      this.usageRepo.findOne({ where: { userId, month } }),
      this.channelRepo.count({ where: { user: { id: userId } } }),
      this.scheduledRepo.count({ where: { post: { user: { id: userId } }, status: 'pending' } }),
      this.templateRepo.count({ where: { userId } }),
    ])

    const now = new Date()
    const hasPaidSub = !!(sub.subscriptionEndsAt && sub.subscriptionEndsAt > now)
    const trialActive = !!(sub.trialEndsAt && sub.trialEndsAt > now)
    const isTrial = trialActive && !hasPaidSub

    const trialDaysLeft = isTrial
      ? Math.ceil((sub.trialEndsAt!.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      : null

    return {
      plan: sub.plan,
      effectivePlan,
      isTrial,
      trialDaysLeft,
      trialEndsAt: sub.trialEndsAt,
      subscriptionEndsAt: sub.subscriptionEndsAt,
      usage: {
        aiGenerations: aiLog?.aiGenerations ?? 0,
        scheduledPosts: scheduledCount,
        channels: channelsCount,
        templates: templatesCount,
      },
      limits,
    }
  }

  /** Throw 402 if user has reached the channels limit */
  async assertChannelLimit(userId: string): Promise<void> {
    const sub = await this.getOrCreate(userId)
    const plan = this.getEffectivePlan(sub)
    const limit = PLAN_LIMITS[plan].channels
    if (limit === -1) return
    const count = await this.channelRepo.count({ where: { user: { id: userId } } })
    if (count >= limit) throw new AppError('LIMIT_CHANNELS', 402)
  }

  /** Throw 402 if user has reached the scheduled posts limit */
  async assertScheduledPostsLimit(userId: string): Promise<void> {
    const sub = await this.getOrCreate(userId)
    const plan = this.getEffectivePlan(sub)
    const limit = PLAN_LIMITS[plan].scheduledPosts
    if (limit === -1) return
    const count = await this.scheduledRepo.count({
      where: { post: { user: { id: userId } }, status: 'pending' },
    })
    if (count >= limit) throw new AppError('LIMIT_SCHEDULED', 402)
  }

  /** Throw 402 if user has reached the AI generations limit for this month */
  async assertAiLimit(userId: string): Promise<void> {
    const sub = await this.getOrCreate(userId)
    const plan = this.getEffectivePlan(sub)
    const limit = PLAN_LIMITS[plan].aiGenerationsPerMonth
    if (limit === -1) return
    if (limit === 0) throw new AppError('LIMIT_AI', 402)
    const month = currentMonth()
    const log = await this.usageRepo.findOne({ where: { userId, month } })
    if ((log?.aiGenerations ?? 0) >= limit) throw new AppError('LIMIT_AI', 402)
  }

  /** Throw 402 if user has reached the templates limit */
  async assertTemplateLimit(userId: string): Promise<void> {
    const sub = await this.getOrCreate(userId)
    const plan = this.getEffectivePlan(sub)
    const limit = PLAN_LIMITS[plan].templates
    if (limit === -1) return
    if (limit === 0) throw new AppError('LIMIT_TEMPLATES', 402)
    const count = await this.templateRepo.count({ where: { userId } })
    if (count >= limit) throw new AppError('LIMIT_TEMPLATES', 402)
  }

  /** Throw 402 if user's plan doesn't allow the given feature */
  async assertFeature(userId: string, feature: 'competitors' | 'weeklyPlan' | 'voiceProfile'): Promise<void> {
    const sub = await this.getOrCreate(userId)
    const plan = this.getEffectivePlan(sub)
    const limits = PLAN_LIMITS[plan]
    if (!limits[feature]) {
      const code = feature === 'competitors' ? 'LIMIT_FEATURE_COMPETITORS'
        : feature === 'weeklyPlan' ? 'LIMIT_FEATURE_WEEKLY_PLAN'
        : 'LIMIT_FEATURE_VOICE_PROFILE'
      throw new AppError(code, 402)
    }
  }

  /** Increment AI usage counter for current month (атомарно, без race condition) */
  async incrementAiUsage(userId: string): Promise<void> {
    const month = currentMonth()
    // Сначала создаём строку если её нет (ON CONFLICT DO NOTHING)
    await this.usageRepo
      .createQueryBuilder()
      .insert()
      .into(UsageLog)
      .values({ userId, month, aiGenerations: 0 })
      .orIgnore()
      .execute()
    // Атомарный UPDATE SET field = field + 1
    await this.usageRepo.increment({ userId, month }, 'aiGenerations', 1)
  }

  /** YooKassa stub — returns a mock payment URL */
  async initPayment(userId: string, plan: Exclude<PlanKey, 'free'>, months: 1 | 3 | 6 | 12) {
    // In real implementation: call YooKassa API, save order, return redirect URL
    const orderId = `order_${userId.slice(0, 8)}_${Date.now()}`
    return {
      orderId,
      paymentUrl: `https://yookassa.ru/checkout/payments/${orderId}`, // stub
      plan,
      months,
    }
  }

  /** Downgrade to free — clears paid subscription and trial */
  async downgradeFree(userId: string): Promise<void> {
    const sub = await this.getOrCreate(userId)
    sub.plan = 'free'
    sub.subscriptionEndsAt = null
    sub.trialEndsAt = null
    await this.subRepo.save(sub)
  }

  /** Activate a plan after successful payment */
  async activatePlan(userId: string, plan: Exclude<PlanKey, 'free'>, months: number): Promise<UserSubscription> {
    const sub = await this.getOrCreate(userId)
    const now = new Date()
    const base = sub.subscriptionEndsAt && sub.subscriptionEndsAt > now
      ? sub.subscriptionEndsAt
      : now
    const endsAt = new Date(base)
    endsAt.setMonth(endsAt.getMonth() + months)
    sub.plan = plan
    sub.subscriptionEndsAt = endsAt
    return this.subRepo.save(sub)
  }
}

export const subscriptionService = new SubscriptionService()

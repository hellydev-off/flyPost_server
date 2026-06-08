import crypto from 'crypto'
import { AppDataSource } from '../config/database'
import { Referral } from '../entities/Referral'
import { UserSubscription } from '../entities/UserSubscription'
import { User } from '../entities/User'

function generateCode(): string {
  return crypto.randomBytes(4).toString('hex').toUpperCase()
}

const BONUS_TIERS: Array<{ referrals: number; bonusDays: number }> = [
  { referrals: 1, bonusDays: 7 },
  { referrals: 3, bonusDays: 30 },
]

class ReferralService {
  private get repo() { return AppDataSource.getRepository(Referral) }
  private get subRepo() { return AppDataSource.getRepository(UserSubscription) }
  private get userRepo() { return AppDataSource.getRepository(User) }

  async processReferral(referrerId: string, referredId: string): Promise<void> {
    if (referrerId === referredId) return

    const exists = await this.repo.findOne({ where: { referredId } })
    if (exists) return

    const referral = this.repo.create({ referrerId, referredId, bonusGranted: false })
    await this.repo.save(referral)

    await this.applyBonus(referrerId)
  }

  private async applyBonus(referrerId: string): Promise<void> {
    const count = await this.repo.count({ where: { referrerId, bonusGranted: true } })
    const total = await this.repo.count({ where: { referrerId } })

    // Find applicable tier based on total referrals
    const tier = [...BONUS_TIERS].reverse().find(t => total >= t.referrals && count < t.referrals)
    if (!tier) return

    const sub = await this.subRepo.findOne({ where: { userId: referrerId } })
    if (!sub) return

    const now = new Date()
    const base = sub.subscriptionEndsAt && sub.subscriptionEndsAt > now
      ? sub.subscriptionEndsAt
      : now

    sub.subscriptionEndsAt = new Date(base.getTime() + tier.bonusDays * 24 * 60 * 60 * 1000)
    if (sub.plan === 'free') sub.plan = 'pro'
    await this.subRepo.save(sub)

    // Mark referrals as bonus granted
    const unbonused = await this.repo.find({ where: { referrerId, bonusGranted: false } })
    for (const r of unbonused) {
      r.bonusGranted = true
      await this.repo.save(r)
    }
  }

  async getStats(userId: string): Promise<{
    referralCode: string
    referralLink: string
    count: number
    bonusDays: number
    nextTierReferrals: number | null
    nextTierBonus: number | null
  }> {
    let user = await this.userRepo.findOne({ where: { id: userId } })
    if (!user) throw new Error('User not found')

    // Генерируем код для старых юзеров, у которых его ещё нет
    if (!user.referralCode) {
      user.referralCode = generateCode()
      await this.userRepo.save(user)
    }

    const referralCode = user.referralCode
    const botUsername = process.env.TELEGRAM_BOT_USERNAME || 'neoPostBot'
    const referralLink = `https://t.me/${botUsername}?start=ref_${referralCode}`

    const count = await this.repo.count({ where: { referrerId: userId } })

    const sub = await this.subRepo.findOne({ where: { userId } })
    const now = new Date()
    let bonusDays = 0
    if (sub?.subscriptionEndsAt && sub.subscriptionEndsAt > now) {
      bonusDays = Math.floor((sub.subscriptionEndsAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
    }

    const nextTier = BONUS_TIERS.find(t => t.referrals > count)

    return {
      referralCode,
      referralLink,
      count,
      bonusDays,
      nextTierReferrals: nextTier ? nextTier.referrals - count : null,
      nextTierBonus: nextTier ? nextTier.bonusDays : null,
    }
  }
}

export const referralService = new ReferralService()

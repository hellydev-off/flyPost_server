import { AppDataSource } from '../config/database'
import { UserAchievement, AchievementType } from '../entities/UserAchievement'
import { Post } from '../entities/Post'
import { ScheduledPost } from '../entities/ScheduledPost'
import { ChannelStatsHistory } from '../entities/ChannelStatsHistory'
import { Channel } from '../entities/Channel'

class AchievementService {
  private get repo() {
    return AppDataSource.getRepository(UserAchievement)
  }

  async getByUser(userId: string): Promise<UserAchievement[]> {
    return this.repo.find({ where: { userId }, order: { unlockedAt: 'ASC' } })
  }

  async checkAndAward(userId: string): Promise<UserAchievement[]> {
    const postRepo = AppDataSource.getRepository(Post)
    const scheduledRepo = AppDataSource.getRepository(ScheduledPost)

    const existing = await this.repo.find({ where: { userId } })
    const existingTypes = new Set(existing.map(a => a.type))

    const toAward: AchievementType[] = []

    if (!existingTypes.has('first_post')) {
      const count = await postRepo.count({ where: { user: { id: userId } } })
      if (count >= 1) toAward.push('first_post')
    }

    const publishedCount = await postRepo.count({
      where: { user: { id: userId }, status: 'published' },
    })

    if (!existingTypes.has('posts_10') && publishedCount >= 10) {
      toAward.push('posts_10')
    }

    if (!existingTypes.has('posts_50') && publishedCount >= 50) {
      toAward.push('posts_50')
    }

    if (!existingTypes.has('first_scheduled')) {
      const count = await scheduledRepo
        .createQueryBuilder('sp')
        .leftJoin('sp.post', 'post')
        .where('post.userId = :userId', { userId })
        .getCount()
      if (count >= 1) toAward.push('first_scheduled')
    }

    // streak_30: публикации 30 дней подряд
    if (!existingTypes.has('streak_30')) {
      const streak = await this.calcStreak(userId)
      if (streak >= 30) toAward.push('streak_30')
    }

    // subs_1000: хотя бы один канал достиг 1000 подписчиков
    if (!existingTypes.has('subs_1000')) {
      const channels = await AppDataSource.getRepository(Channel).find({
        where: { user: { id: userId } },
      })
      for (const ch of channels) {
        const latest = await AppDataSource.getRepository(ChannelStatsHistory).findOne({
          where: { channel: { id: ch.id } },
          order: { recordedAt: 'DESC' },
        })
        if (latest && latest.subscriberCount >= 1000) {
          toAward.push('subs_1000')
          break
        }
      }
    }

    if (!toAward.length) return []

    const newOnes = toAward.map(type => this.repo.create({ userId, type }))
    return this.repo.save(newOnes)
  }

  private async calcStreak(userId: string): Promise<number> {
    const posts = await AppDataSource.getRepository(Post)
      .createQueryBuilder('p')
      .select("DATE(p.publishedAt)", 'day')
      .where('p.userId = :userId AND p.status = :status', { userId, status: 'published' })
      .groupBy("DATE(p.publishedAt)")
      .orderBy("DATE(p.publishedAt)", 'DESC')
      .getRawMany<{ day: string }>()

    if (!posts.length) return 0

    let streak = 1
    for (let i = 0; i < posts.length - 1; i++) {
      const curr = new Date(posts[i].day)
      const prev = new Date(posts[i + 1].day)
      const diff = (curr.getTime() - prev.getTime()) / 86400000
      if (diff === 1) streak++
      else break
    }
    return streak
  }
}

export const achievementService = new AchievementService()

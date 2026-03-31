import { AppDataSource } from '../config/database'
import { UserAchievement, AchievementType } from '../entities/UserAchievement'
import { Post } from '../entities/Post'
import { ScheduledPost } from '../entities/ScheduledPost'

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

    if (!toAward.length) return []

    const newOnes = toAward.map(type => this.repo.create({ userId, type }))
    return this.repo.save(newOnes)
  }
}

export const achievementService = new AchievementService()

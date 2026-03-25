import { AppDataSource } from '../config/database'
import { Post } from '../entities/Post'
import { AppError } from '../utils/AppError'
import { Channel } from '../entities/Channel'

interface ChannelAnalytics {
  total: number
  published: number
  scheduled: number
  drafts: number
  lastPosts: Post[]
}

class AnalyticsService {
  private get postRepo() {
    return AppDataSource.getRepository(Post)
  }

  private get channelRepo() {
    return AppDataSource.getRepository(Channel)
  }

  async getChannelAnalytics(channelId: string, userId: string): Promise<ChannelAnalytics> {
    const channel = await this.channelRepo.findOne({
      where: { id: channelId, user: { id: userId } },
    })
    if (!channel) {
      throw new AppError('Channel not found', 404)
    }

    const [total, published, scheduled, drafts, lastPosts] = await Promise.all([
      this.postRepo.count({ where: { channel: { id: channelId } } }),
      this.postRepo.count({ where: { channel: { id: channelId }, status: 'published' } }),
      this.postRepo.count({ where: { channel: { id: channelId }, status: 'scheduled' } }),
      this.postRepo.count({ where: { channel: { id: channelId }, status: 'draft' } }),
      this.postRepo.find({
        where: { channel: { id: channelId } },
        order: { createdAt: 'DESC' },
        take: 5,
      }),
    ])

    return { total, published, scheduled, drafts, lastPosts }
  }
}

export const analyticsService = new AnalyticsService()

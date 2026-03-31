import { AppDataSource } from '../config/database'
import { Post, PostStatus } from '../entities/Post'
import { Channel } from '../entities/Channel'
import { User } from '../entities/User'
import { AppError } from '../utils/AppError'
import { telegramService } from './telegram.service'
import { achievementService } from './achievement.service'

interface CreatePostDto {
  channelId: string
  content: string
}

interface GetPostsFilters {
  channelId?: string
  status?: PostStatus
}

class PostsService {
  private get postRepo() {
    return AppDataSource.getRepository(Post)
  }

  async getPostsByUser(userId: string, filters: GetPostsFilters): Promise<Post[]> {
    const query = this.postRepo
      .createQueryBuilder('post')
      .leftJoinAndSelect('post.channel', 'channel')
      .where('post.userId = :userId', { userId })

    if (filters.channelId) {
      query.andWhere('post.channelId = :channelId', { channelId: filters.channelId })
    }
    if (filters.status) {
      query.andWhere('post.status = :status', { status: filters.status })
    }

    return query.orderBy('post.createdAt', 'DESC').getMany()
  }

  async getPostById(postId: string, userId: string): Promise<Post> {
    const post = await this.postRepo.findOne({
      where: { id: postId, user: { id: userId } },
      relations: ['channel'],
    })
    if (!post) {
      throw new AppError('Post not found', 404)
    }
    return post
  }

  async createPost(userId: string, dto: CreatePostDto): Promise<Post> {
    const channel = new Channel()
    channel.id = dto.channelId

    const user = new User()
    user.id = userId

    const post = this.postRepo.create({
      channel,
      user,
      content: dto.content,
      status: 'draft',
    })

    const saved = await this.postRepo.save(post)
    achievementService.checkAndAward(userId).catch(() => {})
    return saved
  }

  async updatePost(postId: string, userId: string, content: string): Promise<Post> {
    const post = await this.getPostById(postId, userId)
    post.content = content
    return this.postRepo.save(post)
  }

  async publishPost(postId: string, userId: string): Promise<Post> {
    const post = await this.postRepo.findOne({
      where: { id: postId, user: { id: userId } },
      relations: ['channel'],
    })
    if (!post) {
      throw new AppError('Post not found', 404)
    }
    if (post.status === 'published') {
      throw new AppError('Post already published', 400)
    }

    let messageId: number | null = null
    try {
      const result = await telegramService.publishPost(post.channel.telegramChannelId, post.content)
      messageId = result.messageId
    } catch {
      throw new AppError('Telegram API error', 500)
    }

    post.status = 'published'
    post.publishedAt = new Date()
    post.messageId = messageId
    const saved = await this.postRepo.save(post)
    achievementService.checkAndAward(userId).catch(() => {})
    return saved
  }

  async deletePost(postId: string, userId: string): Promise<void> {
    const post = await this.getPostById(postId, userId)
    await this.postRepo.remove(post)
  }
}

export const postsService = new PostsService()

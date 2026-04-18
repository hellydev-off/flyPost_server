import { AppDataSource } from '../config/database'
import { Post, PostStatus, MediaFile, MediaType, PostButton, PostPoll } from '../entities/Post'
import { Channel } from '../entities/Channel'
import { User } from '../entities/User'
import { AppError } from '../utils/AppError'
import { telegramService } from './telegram.service'
import { achievementService } from './achievement.service'
import { notificationService } from './notification.service'

interface CreatePostDto {
  channelId: string
  content: string
  buttons?: PostButton[]
  poll?: PostPoll | null
  protectContent?: boolean
  pinAfterPublish?: boolean
  disableWebPreview?: boolean
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

  private validateContent(content: string): void {
    if (!content || !content.trim()) throw new AppError('Контент поста не может быть пустым', 400)
    if (content.length > 4096) throw new AppError('Контент поста не может превышать 4096 символов', 400)
  }

  async createPost(userId: string, dto: CreatePostDto): Promise<Post> {
    this.validateContent(dto.content)

    const channelRepo = AppDataSource.getRepository(Channel)
    const channel = await channelRepo.findOne({ where: { id: dto.channelId, user: { id: userId } } })
    if (!channel) throw new AppError('Channel not found', 404)

    const user = new User()
    user.id = userId

    const post = this.postRepo.create({
      channel,
      user,
      content: dto.content,
      status: 'draft',
      buttons: dto.buttons ?? null,
      poll: dto.poll ?? null,
      protectContent: dto.protectContent ?? false,
      pinAfterPublish: dto.pinAfterPublish ?? false,
      disableWebPreview: dto.disableWebPreview ?? false,
    })

    const saved = await this.postRepo.save(post)
    achievementService.checkAndAward(userId).catch(err => {
      console.error(`[POSTS] checkAndAward failed for user ${userId}:`, err)
    })
    return saved
  }

  async updatePost(
    postId: string,
    userId: string,
    data: {
      content: string
      buttons?: PostButton[] | null
      poll?: PostPoll | null
      protectContent?: boolean
      pinAfterPublish?: boolean
      disableWebPreview?: boolean
    },
  ): Promise<Post> {
    this.validateContent(data.content)
    const post = await this.getPostById(postId, userId)
    post.content = data.content
    if (data.buttons !== undefined) post.buttons = data.buttons
    if (data.poll !== undefined) post.poll = data.poll
    if (data.protectContent !== undefined) post.protectContent = data.protectContent
    if (data.pinAfterPublish !== undefined) post.pinAfterPublish = data.pinAfterPublish
    if (data.disableWebPreview !== undefined) post.disableWebPreview = data.disableWebPreview
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
    if (post.status === 'scheduled') {
      throw new AppError('Post is scheduled — cancel the schedule before publishing manually', 400)
    }

    let messageId: number | null = null
    try {
      const result = await telegramService.publishPost(post.channel.telegramChannelId, post.content, post.mediaFiles, {
        buttons: post.buttons,
        poll: post.poll,
        protectContent: post.protectContent,
        pinAfterPublish: post.pinAfterPublish,
        disableWebPreview: post.disableWebPreview,
      })
      messageId = result.messageId
    } catch (err) {
      console.error(`[POSTS] Telegram publish failed for post ${postId}:`, err)
      throw new AppError('Ошибка публикации в Telegram', 500)
    }

    post.status = 'published'
    post.publishedAt = new Date()
    post.messageId = messageId

    let saved: Post
    try {
      saved = await this.postRepo.save(post)
    } catch (saveErr) {
      console.error(`[POSTS] DB save failed after Telegram publish (post ${postId}), retrying...`, saveErr)
      try {
        saved = await this.postRepo.save(post)
      } catch (retryErr) {
        console.error(`[POSTS] Retry failed. Post ${postId} published in Telegram but DB save failed.`, retryErr)
        // Ставим failed чтобы пользователь не мог опубликовать повторно и не было дубля
        await this.postRepo.update(postId, { status: 'failed' }).catch(() => {})
        throw new AppError('Пост опубликован в Telegram, но произошла ошибка сохранения. Обратитесь в поддержку.', 500)
      }
    }

    achievementService.checkAndAward(userId).then(awarded => {
      awarded.forEach(a => notificationService.notifyAchievement(userId, a.type).catch(err => {
        console.error(`[POSTS] notifyAchievement failed for user ${userId}:`, err)
      }))
    }).catch(err => {
      console.error(`[POSTS] checkAndAward failed for user ${userId}:`, err)
    })

    notificationService.notify({
      userId,
      type: 'post_published',
      data: {
        channelTitle: post.channel.title,
        preview: post.content,
      },
    }).catch(err => {
      console.error(`[POSTS] notify post_published failed for user ${userId}:`, err)
    })

    return saved
  }

  async crossPost(postId: string, userId: string, channelIds: string[]): Promise<Post[]> {
    if (!channelIds.length) throw new AppError('Укажи хотя бы один канал', 400)
    if (channelIds.length > 10) throw new AppError('Максимум 10 каналов за раз', 400)

    const source = await this.getPostById(postId, userId)

    const channelRepo = AppDataSource.getRepository(Channel)
    const results: Post[] = []

    for (const channelId of channelIds) {
      if (channelId === source.channel.id) continue  // пропускаем исходный канал

      const channel = await channelRepo.findOne({ where: { id: channelId, user: { id: userId } } })
      if (!channel) continue  // пропускаем чужие / несуществующие каналы

      const user = new User()
      user.id = userId

      const copy = this.postRepo.create({
        channel, user,
        content: source.content,
        status: 'draft',
      })
      const saved = await this.postRepo.save(copy)

      try {
        const fullPost = await this.postRepo.findOne({ where: { id: saved.id }, relations: ['channel'] })
        if (!fullPost) continue

        const result = await telegramService.publishPost(fullPost.channel.telegramChannelId, fullPost.content, fullPost.mediaFiles, {
          buttons: fullPost.buttons,
          poll: fullPost.poll,
          protectContent: fullPost.protectContent,
          pinAfterPublish: fullPost.pinAfterPublish,
          disableWebPreview: fullPost.disableWebPreview,
        })
        fullPost.status = 'published'
        fullPost.publishedAt = new Date()
        fullPost.messageId = result.messageId
        const published = await this.postRepo.save(fullPost)
        results.push(published)

        notificationService.notify({
          userId,
          type: 'post_published',
          data: { channelTitle: fullPost.channel.title, preview: fullPost.content },
        }).catch(err => {
          console.error(`[POSTS] crossPost notify failed for channel ${channelId}:`, err)
        })
      } catch (err) {
        console.error(`[POSTS] crossPost failed for channel ${channelId}:`, err)
        saved.status = 'failed'
        await this.postRepo.save(saved)
        results.push(saved)
      }
    }

    achievementService.checkAndAward(userId).then(awarded => {
      awarded.forEach(a => notificationService.notifyAchievement(userId, a.type).catch(err => {
        console.error(`[POSTS] notifyAchievement failed for user ${userId}:`, err)
      }))
    }).catch(err => {
      console.error(`[POSTS] checkAndAward failed for user ${userId}:`, err)
    })

    return results
  }

  async attachMedia(postId: string, userId: string, files: Express.Multer.File[]): Promise<Post> {
    const post = await this.getPostById(postId, userId)

    const mediaFiles: MediaFile[] = files.map(f => {
      const mime = f.mimetype
      let type: MediaType = 'document'
      if (mime.startsWith('image/')) type = 'photo'
      else if (mime.startsWith('video/')) type = 'video'
      else if (mime.startsWith('audio/')) type = 'audio'

      return {
        type,
        url: `/uploads/${f.filename}`,
        filename: f.originalname,
        size: f.size,
        mimeType: mime,
      }
    })

    post.mediaFiles = [...(post.mediaFiles ?? []), ...mediaFiles]
    return this.postRepo.save(post)
  }

  async deletePost(postId: string, userId: string): Promise<void> {
    const post = await this.getPostById(postId, userId)
    await this.postRepo.remove(post)
  }
}

export const postsService = new PostsService()

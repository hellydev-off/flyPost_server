import { Queue, Worker, Job } from 'bullmq'
import IORedis from 'ioredis'
import { v4 as uuidv4 } from 'uuid'
import { AppDataSource } from '../config/database'
import { ScheduledPost } from '../entities/ScheduledPost'
import { Post } from '../entities/Post'
import { Channel } from '../entities/Channel'
import { User } from '../entities/User'
import { AppError } from '../utils/AppError'
import { isMockMode } from '../utils/mockMode'
import { telegramService } from './telegram.service'
import { achievementService } from './achievement.service'
import { notificationService } from './notification.service'

interface CreateScheduledPostDto {
  postId: string
  scheduledAt: Date
  userId: string
}

class SchedulerService {
  private queue: Queue | null = null
  private worker: Worker | null = null

  private get scheduledPostRepo() {
    return AppDataSource.getRepository(ScheduledPost)
  }

  private get postRepo() {
    return AppDataSource.getRepository(Post)
  }

  initialize(): void {
    if (isMockMode) return

    const connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: null,
    })

    this.queue = new Queue('post-publishing', { connection })

    this.worker = new Worker(
      'post-publishing',
      async (job: Job) => {
        await this.processJob(job)
      },
      { connection },
    )

    this.worker.on('failed', (job, err) => {
      console.error(`[SCHEDULER] Job ${job?.id} failed:`, err)
    })

    console.log('[SCHEDULER] BullMQ initialized')
  }

  private async processJob(job: Job): Promise<void> {
    const { postId } = job.data as { postId: string }

    const post = await this.postRepo.findOne({
      where: { id: postId },
      relations: ['channel'],
    })
    if (!post) return

    const scheduledPost = await this.scheduledPostRepo.findOne({
      where: { post: { id: postId } },
    })

    try {
      const { messageId } = await telegramService.publishPost(post.channel.telegramChannelId, post.content, post.mediaFiles, {
        buttons: post.buttons,
        poll: post.poll,
        protectContent: post.protectContent,
        pinAfterPublish: post.pinAfterPublish,
        disableWebPreview: post.disableWebPreview,
      })
      post.status = 'published'
      post.publishedAt = new Date()
      post.messageId = messageId
      await this.postRepo.save(post)

      if (scheduledPost) {
        scheduledPost.status = 'sent'
        await this.scheduledPostRepo.save(scheduledPost)
      }

      notificationService.notify({
        userId: post.user?.id ?? (post as any).userId,
        type: 'post_published',
        data: { channelTitle: post.channel.title, preview: post.content },
      }).catch(() => {})
    } catch (err) {
      post.status = 'failed'
      await this.postRepo.save(post)

      notificationService.notify({
        userId: post.user?.id ?? (post as any).userId,
        type: 'post_failed',
        data: { channelTitle: post.channel.title },
      }).catch(() => {})

      throw err
    }
  }

  async getScheduledPostsByUser(userId: string): Promise<ScheduledPost[]> {
    return this.scheduledPostRepo
      .createQueryBuilder('sp')
      .leftJoinAndSelect('sp.post', 'post')
      .leftJoinAndSelect('post.channel', 'channel')
      .where('post.userId = :userId', { userId })
      .orderBy('sp.scheduledAt', 'ASC')
      .getMany()
  }

  async schedulePost(dto: CreateScheduledPostDto): Promise<ScheduledPost> {
    const { postId, scheduledAt, userId } = dto

    if (scheduledAt.getTime() <= Date.now()) {
      throw new AppError('scheduledAt must be in the future', 400)
    }

    const existing = await this.scheduledPostRepo.findOne({
      where: { post: { id: postId } },
    })
    if (existing) {
      throw new AppError('Post already scheduled', 400)
    }

    const post = new Post()
    post.id = postId

    // обновить статус поста
    await this.postRepo.update(postId, { status: 'scheduled' })

    let jobId: string

    if (isMockMode) {
      console.log('[MOCK SCHEDULER] Scheduled post', postId, 'for', scheduledAt)
      jobId = 'mock-' + uuidv4()
    } else {
      const delay = scheduledAt.getTime() - Date.now()
      const job = await this.queue!.add('publish', { postId }, { delay })
      jobId = job.id!
    }

    const scheduledPost = this.scheduledPostRepo.create({
      post,
      scheduledAt,
      jobId,
      status: 'pending',
    })

    const saved = await this.scheduledPostRepo.save(scheduledPost)

    achievementService.checkAndAward(userId).then(awarded => {
      awarded.forEach(a => notificationService.notifyAchievement(userId, a.type).catch(() => {}))
    }).catch(() => {})

    // Загружаем channel для уведомления
    const postWithChannel = await this.postRepo.findOne({ where: { id: postId }, relations: ['channel'] })
    if (postWithChannel) {
      notificationService.notify({
        userId,
        type: 'post_scheduled',
        data: {
          channelTitle: postWithChannel.channel.title,
          scheduledAt: scheduledAt.toLocaleString('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }),
        },
      }).catch(() => {})
    }

    return saved
  }

  async updateScheduledPost(
    scheduledPostId: string,
    scheduledAt: Date,
    userId: string,
  ): Promise<ScheduledPost> {
    const scheduledPost = await this.scheduledPostRepo.findOne({
      where: { id: scheduledPostId },
      relations: ['post', 'post.user'],
    })

    if (!scheduledPost || scheduledPost.post.user.id !== userId) {
      throw new AppError('Scheduled post not found', 404)
    }

    if (scheduledAt.getTime() <= Date.now()) {
      throw new AppError('scheduledAt must be in the future', 400)
    }

    // отменить старый job
    if (!isMockMode && scheduledPost.jobId && this.queue) {
      const oldJob = await this.queue.getJob(scheduledPost.jobId)
      if (oldJob) await oldJob.remove()
    }

    let newJobId: string

    if (isMockMode) {
      console.log('[MOCK SCHEDULER] Rescheduled post', scheduledPost.post.id, 'for', scheduledAt)
      newJobId = 'mock-' + uuidv4()
    } else {
      const delay = scheduledAt.getTime() - Date.now()
      const job = await this.queue!.add('publish', { postId: scheduledPost.post.id }, { delay })
      newJobId = job.id!
    }

    scheduledPost.scheduledAt = scheduledAt
    scheduledPost.jobId = newJobId

    return this.scheduledPostRepo.save(scheduledPost)
  }

  async cancelScheduledPost(scheduledPostId: string, userId: string): Promise<void> {
    const scheduledPost = await this.scheduledPostRepo.findOne({
      where: { id: scheduledPostId },
      relations: ['post', 'post.user'],
    })

    if (!scheduledPost || scheduledPost.post.user.id !== userId) {
      throw new AppError('Scheduled post not found', 404)
    }

    // отменить BullMQ job
    if (!isMockMode && scheduledPost.jobId && this.queue) {
      const job = await this.queue.getJob(scheduledPost.jobId)
      if (job) await job.remove()
    }

    // вернуть статус поста в draft
    await this.postRepo.update(scheduledPost.post.id, { status: 'draft' })

    scheduledPost.status = 'cancelled'
    await this.scheduledPostRepo.save(scheduledPost)
    await this.scheduledPostRepo.remove(scheduledPost)
  }
}

export const schedulerService = new SchedulerService()

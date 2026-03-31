import { Queue, Worker, Job } from 'bullmq'
import IORedis from 'ioredis'
import { AppDataSource } from '../config/database'
import { Channel } from '../entities/Channel'
import { ChannelStatsHistory } from '../entities/ChannelStatsHistory'
import { isMockMode } from '../utils/mockMode'
import { telegramService } from './telegram.service'

class StatsCollectorService {
  private queue: Queue | null = null
  private worker: Worker | null = null

  private get channelRepo() {
    return AppDataSource.getRepository(Channel)
  }

  private get historyRepo() {
    return AppDataSource.getRepository(ChannelStatsHistory)
  }

  initialize(): void {
    if (isMockMode) return

    const connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: null,
    })

    this.queue = new Queue('stats-collector', { connection })

    this.worker = new Worker(
      'stats-collector',
      async (job: Job) => {
        await this.collectAll()
      },
      { connection },
    )

    // Запускать каждый час
    this.queue.add(
      'collect',
      {},
      {
        repeat: { every: 60 * 60 * 1000 },
        jobId: 'stats-collect-repeatable',
      },
    )

    // Первый сбор через 10 секунд после старта
    this.queue.add('collect-initial', {}, { delay: 10_000 })

    console.log('[STATS COLLECTOR] Initialized, collecting every hour')
  }

  async collectAll(): Promise<void> {
    const channels = await this.channelRepo.find({
      where: { botIsAdmin: true },
    })

    for (const channel of channels) {
      try {
        const count = await telegramService.getChatMemberCount(channel.telegramChannelId)
        if (count > 0) {
          const entry = this.historyRepo.create({
            channel,
            subscriberCount: count,
          })
          await this.historyRepo.save(entry)
        }
      } catch (err) {
        console.error(`[STATS COLLECTOR] Failed for channel ${channel.id}:`, err)
      }
    }
  }
}

export const statsCollectorService = new StatsCollectorService()

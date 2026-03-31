import { AppDataSource } from '../config/database'
import { Competitor } from '../entities/Competitor'
import { User } from '../entities/User'
import { AppError } from '../utils/AppError'
import { telegramService } from './telegram.service'
import { grokService } from './grok.service'

interface AddCompetitorDto {
  channelUsername: string
  title: string
}

export interface CompetitorAnalysis {
  memberCount: number
  insights: string
}

class CompetitorService {
  private get repo() {
    return AppDataSource.getRepository(Competitor)
  }

  async getAll(userId: string): Promise<Competitor[]> {
    return this.repo.find({
      where: { user: { id: userId } },
      order: { createdAt: 'DESC' },
    })
  }

  async add(userId: string, dto: AddCompetitorDto): Promise<Competitor> {
    const existing = await this.repo.findOne({
      where: { user: { id: userId }, channelUsername: dto.channelUsername },
    })
    if (existing) throw new AppError('Конкурент с таким username уже добавлен', 400)

    const user = new User()
    user.id = userId

    const competitor = this.repo.create({
      user,
      channelUsername: dto.channelUsername.replace(/^@/, ''),
      title: dto.title,
    })

    return this.repo.save(competitor)
  }

  async delete(userId: string, competitorId: string): Promise<void> {
    const competitor = await this.repo.findOne({
      where: { id: competitorId, user: { id: userId } },
    })
    if (!competitor) throw new AppError('Конкурент не найден', 404)
    await this.repo.remove(competitor)
  }

  async analyze(userId: string, competitorId: string): Promise<Competitor> {
    const competitor = await this.repo.findOne({
      where: { id: competitorId, user: { id: userId } },
    })
    if (!competitor) throw new AppError('Конкурент не найден', 404)

    const username = '@' + competitor.channelUsername
    const memberCount = await telegramService.getChatMemberCount(username)

    const insights = await grokService.rawRequest(
      'Ты аналитик Telegram-каналов. Пиши по-русски, кратко и по делу.',
      `Проанализируй Telegram-канал "${username}" (название: "${competitor.title}", подписчиков: ${memberCount}).

Дай анализ в 4 абзацах:
1. Предполагаемая тематика и контент-стратегия
2. Что канал вероятно делает хорошо (по названию и размеру аудитории)
3. Чем можно вдохновиться для своего канала
4. Возможные слабые места и как использовать это в свою пользу`,
    )

    const analysis: CompetitorAnalysis = { memberCount, insights }
    competitor.lastAnalysis = JSON.stringify(analysis)
    competitor.analyzedAt = new Date()

    return this.repo.save(competitor)
  }
}

export const competitorService = new CompetitorService()

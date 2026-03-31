import { AppDataSource } from '../config/database'
import { ChannelProfile } from '../entities/ChannelProfile'
import { Channel } from '../entities/Channel'
import { AppError } from '../utils/AppError'

interface UpsertProfileDto {
  tone?: string | null
  audience?: string | null
  topics?: string[]
  forbiddenWords?: string[]
  examples?: string | null
}

class ChannelProfileService {
  private get repo() {
    return AppDataSource.getRepository(ChannelProfile)
  }

  private async verifyOwner(channelId: string, userId: string): Promise<void> {
    const channel = await AppDataSource.getRepository(Channel).findOne({
      where: { id: channelId, user: { id: userId } },
    })
    if (!channel) throw new AppError('Channel not found', 404)
  }

  async get(channelId: string, userId: string): Promise<ChannelProfile | null> {
    await this.verifyOwner(channelId, userId)
    return this.repo.findOne({ where: { channelId } })
  }

  async upsert(channelId: string, userId: string, dto: UpsertProfileDto): Promise<ChannelProfile> {
    await this.verifyOwner(channelId, userId)

    let profile = await this.repo.findOne({ where: { channelId } })
    if (!profile) {
      profile = this.repo.create({ channelId, topics: [], forbiddenWords: [] })
    }

    if (dto.tone !== undefined) profile.tone = dto.tone
    if (dto.audience !== undefined) profile.audience = dto.audience
    if (dto.topics !== undefined) profile.topics = dto.topics
    if (dto.forbiddenWords !== undefined) profile.forbiddenWords = dto.forbiddenWords
    if (dto.examples !== undefined) profile.examples = dto.examples

    return this.repo.save(profile)
  }

  async getByChannelId(channelId: string): Promise<ChannelProfile | null> {
    return this.repo.findOne({ where: { channelId } })
  }
}

export const channelProfileService = new ChannelProfileService()

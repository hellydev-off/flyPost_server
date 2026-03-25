import { AppDataSource } from '../config/database'
import { Channel } from '../entities/Channel'
import { User } from '../entities/User'
import { AppError } from '../utils/AppError'
import { telegramService } from './telegram.service'

interface CreateChannelDto {
  telegramChannelId: string
  title: string
  username?: string
}

class ChannelsService {
  private get channelRepo() {
    return AppDataSource.getRepository(Channel)
  }

  async getChannelsByUser(userId: string): Promise<Channel[]> {
    return this.channelRepo.find({
      where: { user: { id: userId } },
      order: { createdAt: 'DESC' },
    })
  }

  async createChannel(userId: string, dto: CreateChannelDto): Promise<Channel> {
    const botIsAdmin = await telegramService.checkBotIsAdmin(dto.telegramChannelId)
    if (!botIsAdmin) {
      throw new AppError('Bot is not admin in this channel', 400)
    }

    const user = new User()
    user.id = userId

    const channel = this.channelRepo.create({
      user,
      telegramChannelId: dto.telegramChannelId,
      title: dto.title,
      username: dto.username ?? null,
      botIsAdmin: true,
    })

    return this.channelRepo.save(channel)
  }

  async deleteChannel(channelId: string, userId: string): Promise<void> {
    const channel = await this.channelRepo.findOne({
      where: { id: channelId, user: { id: userId } },
    })
    if (!channel) {
      throw new AppError('Channel not found', 404)
    }
    await this.channelRepo.remove(channel)
  }
}

export const channelsService = new ChannelsService()

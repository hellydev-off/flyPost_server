import TelegramBot from 'node-telegram-bot-api'
import { isMockMode } from '../utils/mockMode'

class TelegramService {
  private bot: TelegramBot | null = null
  private botId: number | null = null

  getBot(): TelegramBot {
    if (!this.bot) {
      this.bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN!, { polling: false })
    }
    return this.bot
  }

  private getBotId(): number {
    if (!this.botId) {
      // Первая часть токена до ':' — числовой ID бота
      this.botId = parseInt(process.env.TELEGRAM_BOT_TOKEN!.split(':')[0], 10)
    }
    return this.botId
  }

  async publishPost(
    channelId: string,
    content: string,
  ): Promise<{ messageId: number }> {
    if (isMockMode) {
      console.log('[MOCK TELEGRAM] Publishing to channel:', channelId)
      return { messageId: Math.floor(Math.random() * 100000) }
    }

    try {
      const msg = await this.getBot().sendMessage(channelId, content, {
        parse_mode: 'Markdown',
      })
      return { messageId: msg.message_id }
    } catch (err) {
      console.error('[TELEGRAM] Error sending message:', err)
      throw Object.assign(new Error('Telegram API error'), { statusCode: 500 })
    }
  }

  async getChatMemberCount(channelId: string): Promise<number> {
    if (isMockMode) {
      return Math.floor(Math.random() * 500) + 1000
    }
    try {
      return await this.getBot().getChatMemberCount(channelId)
    } catch {
      return 0
    }
  }

  async checkBotIsAdmin(channelId: string): Promise<boolean> {
    if (isMockMode) {
      return true
    }

    try {
      const member = await this.getBot().getChatMember(channelId, this.getBotId())
      return ['administrator', 'creator'].includes(member.status)
    } catch {
      return false
    }
  }
}

export const telegramService = new TelegramService()

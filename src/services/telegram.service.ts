import TelegramBot from 'node-telegram-bot-api'
import fs from 'fs'
import path from 'path'
import { isMockMode } from '../utils/mockMode'
import { MediaFile, PostButton, PostPoll } from '../entities/Post'

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
    mediaFiles?: MediaFile[] | null,
    options?: {
      buttons?: PostButton[] | null
      poll?: PostPoll | null
      protectContent?: boolean
      pinAfterPublish?: boolean
      disableWebPreview?: boolean
    },
  ): Promise<{ messageId: number }> {
    if (isMockMode) {
      console.log('[MOCK TELEGRAM] Publishing to channel:', channelId, 'media:', mediaFiles?.length ?? 0)
      return { messageId: Math.floor(Math.random() * 100000) }
    }

    const buildKeyboard = (buttons: PostButton[]) => {
      const rows: any[][] = []
      for (const btn of buttons) {
        if (btn.type === 'url') {
          rows.push([{ text: btn.text, url: btn.url }])
        } else {
          const label = btn.clickCount > 0 ? `${btn.text} (${btn.clickCount})` : btn.text
          rows.push([{ text: label, callback_data: `vote:${btn.id}` }])
        }
      }
      return { inline_keyboard: rows }
    }

    const replyMarkup = options?.buttons?.length ? buildKeyboard(options.buttons) : undefined
    const protectContent = options?.protectContent ?? false

    // Telegram caption limit: 1024 chars. If exceeded — send media without caption, then text separately.
    const CAPTION_LIMIT = 1024
    const needsSplit = content.length > CAPTION_LIMIT

    try {
      const bot = this.getBot()
      const media = mediaFiles?.filter(Boolean) ?? []

      let messageId: number

      if (!media.length) {
        const msg = await bot.sendMessage(channelId, content, {
          parse_mode: 'Markdown',
          protect_content: protectContent,
          disable_web_page_preview: options?.disableWebPreview ?? false,
          reply_markup: replyMarkup,
        } as any)
        messageId = msg.message_id
      } else if (media.length > 1) {
        // Группа медиа — caption поддерживает только 1024 символа, кнопки не поддерживаются в группе
        const group: TelegramBot.InputMediaPhoto[] = media.map((f, i) => ({
          type: f.type === 'photo' ? 'photo' : 'video',
          media: fs.createReadStream(path.join(process.cwd(), 'uploads', path.basename(f.url))) as any,
          caption: (!needsSplit && i === 0) ? content : undefined,
          parse_mode: 'Markdown',
        } as any))

        const msgs = await bot.sendMediaGroup(channelId, group, { protect_content: protectContent } as any)
        messageId = msgs[0].message_id

        // Если текст длинный или есть кнопки — отправляем текст отдельно
        if (needsSplit || replyMarkup) {
          await bot.sendMessage(channelId, content, {
            parse_mode: 'Markdown',
            protect_content: protectContent,
            reply_markup: replyMarkup,
          } as any)
        }
      } else {
        // Одиночный файл
        const file = media[0]
        const filePath = path.join(process.cwd(), 'uploads', path.basename(file.url))

        let msg: TelegramBot.Message

        if (needsSplit) {
          // Текст слишком длинный для caption — отправляем медиа без подписи, затем текст отдельно
          const stream = fs.createReadStream(filePath)
          const baseOpts: any = { protect_content: protectContent }
          if (file.type === 'photo') {
            msg = await bot.sendPhoto(channelId, stream, baseOpts)
          } else if (file.type === 'video') {
            msg = await bot.sendVideo(channelId, stream, baseOpts)
          } else if (file.type === 'audio') {
            msg = await bot.sendAudio(channelId, stream, baseOpts)
          } else {
            msg = await bot.sendDocument(channelId, stream, baseOpts)
          }
          messageId = msg.message_id

          await bot.sendMessage(channelId, content, {
            parse_mode: 'Markdown',
            protect_content: protectContent,
            reply_markup: replyMarkup,
          } as any)
        } else {
          const stream = fs.createReadStream(filePath)
          const opts: any = {
            caption: content,
            parse_mode: 'Markdown' as const,
            protect_content: protectContent,
            reply_markup: replyMarkup,
          }

          if (file.type === 'photo') {
            msg = await bot.sendPhoto(channelId, stream, opts)
          } else if (file.type === 'video') {
            msg = await bot.sendVideo(channelId, stream, opts)
          } else if (file.type === 'audio') {
            msg = await bot.sendAudio(channelId, stream, opts)
          } else {
            msg = await bot.sendDocument(channelId, stream, opts)
          }
          messageId = msg.message_id
        }
      }

      if (options?.pinAfterPublish) {
        await bot.pinChatMessage(channelId, messageId, { disable_notification: true }).catch(() => {})
      }

      if (options?.poll) {
        await bot.sendPoll(
          channelId,
          options.poll.question,
          options.poll.options,
          {
            is_anonymous: options.poll.isAnonymous,
            allows_multiple_answers: options.poll.allowsMultipleAnswers,
          } as any,
        ).catch(() => {})
      }

      return { messageId }
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
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('TELEGRAM_UNREACHABLE')), 5000),
      )
      const checkPromise = this.getBot().getChatMember(channelId, this.getBotId())
      const member = await Promise.race([checkPromise, timeoutPromise])
      return ['administrator', 'creator'].includes(member.status)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : ''
      // Если Telegram недоступен с сервера — разрешаем добавление канала
      if (message === 'TELEGRAM_UNREACHABLE' || message.includes('EFATAL') || message.includes('ECONNREFUSED')) {
        console.warn('[TELEGRAM] Unreachable, skipping admin check for channel:', channelId)
        return true
      }
      return false
    }
  }
}

export const telegramService = new TelegramService()

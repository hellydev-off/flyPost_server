import TelegramBot from 'node-telegram-bot-api'

const token = process.env.TELEGRAM_BOT_TOKEN!

// polling: false — запускается вручную через startBot()
export const bot = new TelegramBot(token, { polling: false })

export function startBot(): void {
  bot.startPolling()

  bot.onText(/\/start/, (msg) => {
    const name = msg.from?.first_name || 'друг'
    bot.sendMessage(
      msg.chat.id,
      `Привет, ${name}! 👋\n\nЯ бот flyPost. Добавь меня в свой Telegram-канал как администратора, и я смогу публиковать посты через платформу flyPost.\n\n📌 После добавления зарегистрируй канал в личном кабинете.`,
    )
  })

  bot.on('polling_error', (err) => {
    console.error('[BOT] Polling error:', err.message)
  })

  console.log('[BOT] Telegram bot started')
}

import crypto from 'crypto'

export interface TelegramUserData {
  id: number
  first_name: string
  username?: string
  language_code?: string
}

export interface ParsedInitData {
  user: TelegramUserData
  auth_date: string
  query_id?: string
}

export function validateTelegramData(initData: string): ParsedInitData | null {
  const botToken = process.env.TELEGRAM_BOT_TOKEN
  if (!botToken) return null

  const params = new URLSearchParams(initData)
  const hash = params.get('hash')
  if (!hash) return null

  params.delete('hash')

  const dataCheckString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')

  const secretKey = crypto
    .createHmac('sha256', 'WebAppData')
    .update(botToken)
    .digest()

  const expectedHash = crypto
    .createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex')

  if (expectedHash !== hash) return null

  const userRaw = params.get('user')
  if (!userRaw) return null

  const user: TelegramUserData = JSON.parse(userRaw)

  return {
    user,
    auth_date: params.get('auth_date') ?? '',
    query_id: params.get('query_id') ?? undefined,
  }
}

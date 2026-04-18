/**
 * Audit Bot — отправляет уведомления в личный чат/группу о новых пользователях и оплатах.
 * Env vars: AUDIT_BOT_TOKEN, AUDIT_CHAT_ID
 */

const AUDIT_BOT_TOKEN = process.env.AUDIT_BOT_TOKEN ?? ''
const AUDIT_CHAT_ID   = process.env.AUDIT_CHAT_ID   ?? ''

function isConfigured(): boolean {
  return !!(AUDIT_BOT_TOKEN && AUDIT_CHAT_ID)
}

async function send(text: string): Promise<void> {
  if (!isConfigured()) return
  try {
    await fetch(`https://api.telegram.org/bot${AUDIT_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: AUDIT_CHAT_ID,
        text,
        parse_mode: 'HTML',
      }),
    })
  } catch (err) {
    console.error('[AUDIT] sendMessage failed:', err)
  }
}

class AuditService {
  notifyNewUser(user: {
    id: string
    email: string | null
    username: string | null
    firstName: string
    via: 'email' | 'telegram'
  }): void {
    const who = user.email
      ? `📧 <b>${user.firstName}</b> (${user.email})`
      : `✈️ <b>${user.firstName}</b>${user.username ? ` @${user.username}` : ''}`

    send(
      `👤 <b>Новый пользователь</b>\n` +
      `${who}\n` +
      `Вход через: ${user.via === 'email' ? 'Email' : 'Telegram'}\n` +
      `ID: <code>${user.id}</code>`,
    ).catch(() => {})
  }

  notifyNewPayment(info: {
    userId: string
    email: string | null
    firstName: string
    plan: string
    months: number
    amount: number
  }): void {
    const planNames: Record<string, string> = {
      start: 'Старт',
      pro: 'Про',
      max: 'Максимум',
    }
    const planLabel = planNames[info.plan] ?? info.plan

    send(
      `💰 <b>Новая оплата</b>\n` +
      `👤 ${info.firstName}${info.email ? ` (${info.email})` : ''}\n` +
      `📦 Тариф: <b>${planLabel}</b> на ${info.months} мес.\n` +
      `💵 Сумма: <b>${info.amount} ₽</b>\n` +
      `ID: <code>${info.userId}</code>`,
    ).catch(() => {})
  }
}

export const auditService = new AuditService()

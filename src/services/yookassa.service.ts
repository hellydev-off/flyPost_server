import { AppError } from '../utils/AppError'

const YOOKASSA_API = 'https://api.yookassa.ru/v3'

export interface YookassaPayment {
  id: string
  status: 'pending' | 'waiting_for_capture' | 'succeeded' | 'canceled'
  amount: {
    value: string
    currency: string
  }
  confirmation: {
    type: string
    confirmation_url: string
  }
  metadata: Record<string, string>
  paid: boolean
}

export interface CreatePaymentOptions {
  amount: number           // в рублях, целое число
  description: string
  returnUrl: string
  idempotencyKey: string   // uuid платежа из нашей БД
  metadata: Record<string, string>
}

class YookassaService {
  private get shopId(): string {
    return process.env.YOOKASSA_SHOP_ID ?? ''
  }

  private get secretKey(): string {
    return process.env.YOOKASSA_SECRET_KEY ?? ''
  }

  private authHeader(): string {
    return 'Basic ' + Buffer.from(`${this.shopId}:${this.secretKey}`).toString('base64')
  }

  async createPayment(options: CreatePaymentOptions): Promise<YookassaPayment> {
    const response = await fetch(`${YOOKASSA_API}/payments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: this.authHeader(),
        'Idempotence-Key': options.idempotencyKey,
      },
      body: JSON.stringify({
        amount: {
          value: options.amount.toFixed(2),
          currency: 'RUB',
        },
        confirmation: {
          type: 'redirect',
          return_url: options.returnUrl,
        },
        capture: true,
        description: options.description,
        metadata: options.metadata,
      }),
    })

    if (!response.ok) {
      const err = await response.text()
      console.error('[YOOKASSA] createPayment error:', response.status, err)
      throw new AppError('Ошибка создания платежа в ЮKassa', 502)
    }

    return response.json() as Promise<YookassaPayment>
  }

  async getPayment(yookassaPaymentId: string): Promise<YookassaPayment> {
    const response = await fetch(`${YOOKASSA_API}/payments/${yookassaPaymentId}`, {
      headers: {
        Authorization: this.authHeader(),
      },
    })

    if (!response.ok) {
      const err = await response.text()
      console.error('[YOOKASSA] getPayment error:', response.status, err)
      throw new AppError('Ошибка получения платежа из ЮKassa', 502)
    }

    return response.json() as Promise<YookassaPayment>
  }
}

export const yookassaService = new YookassaService()

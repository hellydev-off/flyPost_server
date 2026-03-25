import { isMockMode } from '../utils/mockMode'
import { AppError } from '../utils/AppError'

type Length = 'short' | 'medium' | 'long'

const LENGTH_DESCRIPTIONS: Record<Length, string> = {
  short: 'короткий (2-3 предложения)',
  medium: 'средний (5-7 предложений)',
  long: 'развёрнутый (10+ предложений)',
}

interface GenerateOptions {
  topic: string
  tone: string
  length: Length
}

class GrokService {
  async generateContent(options: GenerateOptions): Promise<string> {
    const { topic, tone, length } = options

    if (isMockMode) {
      await new Promise((resolve) => setTimeout(resolve, 500))
      return `🚀 [MOCK AI] Пост на тему '${topic}' в тоне '${tone}'.\n\nЗдесь будет сгенерированный текст от Grok API.\n\n#тема #контент #flypost`
    }

    const apiKey = process.env.GROK_API_KEY
    if (!apiKey) {
      throw new AppError('AI service unavailable', 503)
    }

    const lengthDesc = LENGTH_DESCRIPTIONS[length]

    try {
      const response = await fetch('https://api.x.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'grok-3-latest',
          messages: [
            {
              role: 'system',
              content:
                'Ты помощник для создания постов в Telegram-каналах. Пиши только текст поста без пояснений. Поддерживай Telegram Markdown форматирование.',
            },
            {
              role: 'user',
              content: `Напиши ${lengthDesc} пост на тему: ${topic}. Тон: ${tone}. Используй эмодзи. Добавь хештеги в конце.`,
            },
          ],
          max_tokens: 1000,
        }),
      })

      if (!response.ok) {
        throw new Error(`Grok API returned ${response.status}`)
      }

      const data = (await response.json()) as {
        choices: Array<{ message: { content: string } }>
      }

      return data.choices[0].message.content
    } catch (err) {
      console.error('[GROK] Error generating content:', err)
      throw new AppError('AI service unavailable', 503)
    }
  }
}

export const grokService = new GrokService()

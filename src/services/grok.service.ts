import { isMockMode } from '../utils/mockMode'
import { AppError } from '../utils/AppError'

type Length = 'short' | 'medium' | 'long'
type ImproveAction = 'shorten' | 'expand' | 'rephrase' | 'fix' | 'tone'

const LENGTH_DESCRIPTIONS: Record<Length, string> = {
  short: 'короткий (2-3 предложения)',
  medium: 'средний (5-7 предложений)',
  long: 'развёрнутый (10+ предложений)',
}

const IMPROVE_PROMPTS: Record<ImproveAction, string> = {
  shorten: 'Сократи этот пост, сохрани ключевые идеи. Оставь эмодзи и хештеги.',
  expand: 'Расширь и дополни этот пост, добавь больше деталей и аргументов. Сохрани стиль и тон.',
  rephrase: 'Перефразируй этот пост другими словами, сохрани смысл и длину. Сделай текст свежее.',
  fix: 'Исправь грамматику, пунктуацию и стилистику этого поста. Не меняй смысл и структуру.',
  tone: '', // тон задаётся динамически
}

export interface VoiceProfile {
  tone: string | null
  audience: string | null
  topics: string[]
  forbiddenWords: string[]
  examples: string | null
}

interface GenerateOptions {
  topic: string
  tone: string
  length: Length
  voiceProfile?: VoiceProfile | null
}

interface ImproveOptions {
  content: string
  action: ImproveAction
  tone?: string
  voiceProfile?: VoiceProfile | null
}

function buildVoiceSection(profile: VoiceProfile | null | undefined): string {
  if (!profile) return ''

  const parts: string[] = []
  if (profile.tone) parts.push(`Тон голоса канала: ${profile.tone}`)
  if (profile.audience) parts.push(`Целевая аудитория: ${profile.audience}`)
  if (profile.topics.length) parts.push(`Ключевые темы канала: ${profile.topics.join(', ')}`)
  if (profile.forbiddenWords.length) parts.push(`Запрещённые слова (никогда не использовать): ${profile.forbiddenWords.join(', ')}`)
  if (profile.examples) parts.push(`Примеры лучших постов этого канала:\n${profile.examples}`)

  if (!parts.length) return ''
  return `\n\nПРОФИЛЬ ГОЛОСА КАНАЛА (строго придерживайся этого стиля):\n${parts.join('\n')}`
}

class GrokService {
  private async callGrok(systemPrompt: string, userPrompt: string): Promise<string> {
    const apiKey = process.env.GROK_API_KEY
    if (!apiKey) {
      throw new AppError('AI service unavailable', 503)
    }

    try {
      const response = await fetch('https://proxy.gen-api.ru/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: process.env.GROK_MODEL ?? 'grok-3',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error('[GROK] API error:', response.status, errorText)
        throw new Error(`Gen-API returned ${response.status}`)
      }

      const data = (await response.json()) as {
        choices: Array<{ message: { content: string } }>
      }

      return data.choices[0].message.content
    } catch (err) {
      console.error('[GROK] Error:', err)
      throw new AppError('AI service unavailable', 503)
    }
  }

  async rawRequest(systemPrompt: string, userPrompt: string): Promise<string> {
    if (isMockMode) {
      await new Promise((resolve) => setTimeout(resolve, 300))
      return userPrompt.includes('JSON')
        ? '[{"title":"Mock совет","text":"Это мок-рекомендация","type":"tip"}]'
        : '[MOCK AI response]'
    }
    return this.callGrok(systemPrompt, userPrompt)
  }

  async generateContent(options: GenerateOptions): Promise<string> {
    const { topic, tone, length, voiceProfile } = options

    if (isMockMode) {
      await new Promise((resolve) => setTimeout(resolve, 500))
      const profileNote = voiceProfile?.tone ? ` [профиль: ${voiceProfile.tone}]` : ''
      return `🚀 [MOCK AI] Пост на тему '${topic}' в тоне '${tone}'${profileNote}.\n\nЗдесь будет сгенерированный текст от Grok API.\n\n#тема #контент #neopost`
    }

    const voiceSection = buildVoiceSection(voiceProfile)
    const lengthDesc = LENGTH_DESCRIPTIONS[length]

    return this.callGrok(
      `Ты помощник для создания постов в Telegram-каналах. Пиши только текст поста без пояснений. Поддерживай Telegram Markdown форматирование.${voiceSection}`,
      `Напиши ${lengthDesc} пост на тему: ${topic}. Тон: ${tone}. Используй эмодзи. Добавь хештеги в конце.`,
    )
  }

  async generateDailyPlan(channelTitle: string, timeSlots: string[], recentPostsSummary: string, voiceProfile?: VoiceProfile | null): Promise<string> {
    if (isMockMode) {
      await new Promise((resolve) => setTimeout(resolve, 600))
      return JSON.stringify(
        timeSlots.map((t) => ({
          title: `Идея для ${t}`,
          summary: 'Это мок-идея для дневного плана. Здесь будет реальная генерация.',
          scheduledTime: t,
        }))
      )
    }

    const voiceSection = buildVoiceSection(voiceProfile)
    const slotsStr = timeSlots.join(', ')

    return this.callGrok(
      `Ты контент-стратег для Telegram-каналов. Отвечай ТОЛЬКО валидным JSON без markdown-обёртки.${voiceSection}`,
      `Создай план постов для Telegram-канала "${channelTitle}" на сегодня.

Временные слоты для публикации: ${slotsStr}

Последние посты канала (для понимания стиля и тематики):
${recentPostsSummary || 'Нет данных о прошлых постах'}

Верни JSON-массив строго по каждому временному слоту в том же порядке:
[{"title":"Заголовок","summary":"1-2 предложения о чём пост","scheduledTime":"09:00"}]

Адаптируй контент под время суток: утро (до 11:00) — вовлекающие и новостные, день (11:00–17:00) — информативные и полезные, вечер (после 17:00) — аналитические или лёгкие.`,
    )
  }

  async generateWeeklyPlan(channelTitle: string, recentPostsSummary: string, postsPerDay: number, voiceProfile?: VoiceProfile | null): Promise<string> {
    const totalPosts = 7 * postsPerDay

    if (isMockMode) {
      await new Promise((resolve) => setTimeout(resolve, 600))
      const mockTitles = [
        'Тренды недели', 'Экспертный разбор', 'Кейс из практики',
        'Инструменты и лайфхаки', 'Вопрос–ответ', 'Разбор ошибок',
        'Закулисье канала', 'Подборка ресурсов', 'Мнение эксперта',
        'Практические советы', 'История успеха', 'Новости ниши',
        'Чек-лист', 'Топ-5 идей', 'Разбор кейса',
        'Лайфхаки', 'Аналитика', 'Советы новичкам',
        'Обзор инструментов', 'Итоги недели', 'Прогнозы',
        'Мотивация', 'Разбор тренда', 'Вовлечение аудитории',
        'Полезный контент', 'Опрос читателей', 'Подводим итоги',
        'Планы на неделю',
      ]
      const hours = [9, 12, 15, 18]
      const ideas = []
      for (let day = 0; day < 7; day++) {
        for (let p = 0; p < postsPerDay; p++) {
          const idx = day * postsPerDay + p
          ideas.push({
            dayIndex: day,
            title: mockTitles[idx % mockTitles.length],
            summary: 'Краткое описание темы поста для планирования контента на неделю.',
            suggestedHour: hours[p % hours.length],
          })
        }
      }
      return JSON.stringify(ideas)
    }

    const voiceSection = buildVoiceSection(voiceProfile)

    return this.callGrok(
      `Ты контент-стратег для Telegram-каналов. Отвечай ТОЛЬКО валидным JSON без markdown-обёртки.${voiceSection}`,
      `Создай план из ${totalPosts} постов для Telegram-канала "${channelTitle}" на следующие 7 дней (Пн–Вс).

Количество постов в день: ${postsPerDay}

Последние посты канала (для понимания стиля):
${recentPostsSummary || 'Нет данных о прошлых постах'}

Верни JSON-массив ровно из ${totalPosts} объектов — по ${postsPerDay} для каждого дня (dayIndex 0=Пн, 1=Вт, ..., 6=Вс):
[{"dayIndex":0,"title":"Заголовок идеи","summary":"1-2 предложения о чём пост","suggestedHour":9}]

Правила:
- dayIndex строго 0–6, по ${postsPerDay} записей на каждый dayIndex
- suggestedHour — лучший час публикации (7–22), равномерно распредели посты в течение дня
- Темы должны быть разнообразными и соответствовать нише канала`,
    )
  }

  async improveContent(options: ImproveOptions): Promise<string> {
    const { content, action, tone, voiceProfile } = options

    if (isMockMode) {
      await new Promise((resolve) => setTimeout(resolve, 500))
      return `[MOCK AI — ${action}] ${content}`
    }

    const voiceSection = buildVoiceSection(voiceProfile)

    const systemPrompt =
      `Ты помощник для редактирования постов в Telegram-каналах. Возвращай ТОЛЬКО готовый текст поста без пояснений, комментариев или вступлений. Поддерживай Telegram Markdown форматирование.${voiceSection}`

    let userPrompt: string
    if (action === 'tone' && tone) {
      userPrompt = `Перепиши этот пост в тоне "${tone}". Сохрани смысл и длину.\n\nТекст:\n${content}`
    } else {
      userPrompt = `${IMPROVE_PROMPTS[action]}\n\nТекст:\n${content}`
    }

    return this.callGrok(systemPrompt, userPrompt)
  }
}

export const grokService = new GrokService()

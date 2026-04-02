/**
 * Seed script — генерирует тестовые данные
 *
 * Использование:
 *   npx ts-node scripts/seed.ts                          # дефолт: 3 юзера, 2 канала, 30 постов
 *   npx ts-node scripts/seed.ts --users=5 --channels=3 --posts=50 --days=60
 *   npx ts-node scripts/seed.ts --password=mypass123     # свой пароль для всех юзеров
 *   npx ts-node scripts/seed.ts --clean                  # удалить все тестовые данные
 */

import 'reflect-metadata'
import * as dotenv from 'dotenv'
dotenv.config()

import bcrypt from 'bcrypt'
import { AppDataSource } from '../src/config/database'
import { User } from '../src/entities/User'
import { Channel } from '../src/entities/Channel'
import { Post } from '../src/entities/Post'
import { ChannelStatsHistory } from '../src/entities/ChannelStatsHistory'

// ─── Аргументы командной строки ─────────────────────────────
const args = Object.fromEntries(
  process.argv.slice(2).map(a => {
    const [k, v] = a.replace(/^--/, '').split('=')
    return [k, v ?? 'true']
  })
)

const USERS     = parseInt(args.users    ?? '3',  10)
const CHANNELS  = parseInt(args.channels ?? '2',  10)
const POSTS     = parseInt(args.posts    ?? '30', 10)
const DAYS      = parseInt(args.days     ?? '30', 10)
const CLEAN     = args.clean === 'true'
const SEED_TAG   = '[seed]'
const SEED_PASS  = args.password ?? 'seed1234'

// ─── Helpers ─────────────────────────────────────────────────
function rnd(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function randDate(daysAgo: number): Date {
  const d = new Date()
  d.setDate(d.getDate() - Math.floor(Math.random() * daysAgo))
  d.setHours(rnd(8, 22), rnd(0, 59), 0, 0)
  return d
}

const CHANNEL_NAMES = [
  'Tech Insider', 'Digital Pulse', 'Morning Brief', 'Dev Notes',
  'Crypto Wave', 'Design Hub', 'AI Weekly', 'Startup Digest',
  'Finance Tips', 'Science Daily', 'Gaming World', 'Photo Art',
  'Travel Vibes', 'Food & Life', 'Mind Growth', 'Code Craft',
]

const USERNAMES = [
  'tech_insider', 'digitalpulse', 'morning_brief', 'devnotes',
  'cryptowave', 'designhub', 'ai_weekly', 'startup_digest',
  'financetips', 'sciencedaily', 'gamingworld', 'photoart',
  'travelvibes', 'foodandlife', 'mindgrowth', 'codecraft',
]

const POST_TEXTS = [
  'Новый тренд в разработке: почему все переходят на TypeScript?',
  '5 инструментов, которые изменили мой рабочий процесс в этом году.',
  'Как я за 2 недели набрал 1000 подписчиков: честный разбор.',
  'Почему нейросети не заменят разработчиков — аргументы и факты.',
  'Самые частые ошибки при создании Telegram-канала.',
  'Разбор алгоритма: как работает рекомендация контента.',
  'Топ-10 расширений VS Code для продуктивной работы.',
  'Монетизация канала: что реально работает в 2024.',
  'Как писать заголовки, которые хочется открыть.',
  'Архитектура микросервисов: когда это нужно, а когда — нет.',
  'Мой опыт работы с удалёнными командами через 5 часовых поясов.',
  'PostgreSQL vs MongoDB: выбираю базу под задачу.',
  'Почему я перешёл с React на Vue — и не пожалел.',
  'Docker для начинающих: запускаем первый контейнер за 10 минут.',
  'CI/CD без боли: настраиваем GitHub Actions с нуля.',
  'Redis: не только кэш. Разбираем паттерны использования.',
  'Как я автоматизировал публикацию контента и сэкономил 5 часов в неделю.',
  'GraphQL vs REST: что выбрать для нового проекта?',
  'Pinia vs Vuex: почему я больше не использую Vuex.',
  'Telegram Mini Apps: полное руководство для разработчика.',
]

const FIRST_NAMES = ['Алексей', 'Дмитрий', 'Иван', 'Михаил', 'Сергей', 'Андрей', 'Артём', 'Николай', 'Максим', 'Павел']

// ─── Генерация истории подписчиков ───────────────────────────
function generateSubscriberHistory(days: number, finalCount: number): { count: number; date: Date }[] {
  const history: { count: number; date: Date }[] = []
  const startCount = Math.max(10, finalCount - rnd(50, 500))

  for (let i = days; i >= 0; i--) {
    const progress = 1 - i / days
    const trend = startCount + (finalCount - startCount) * progress
    const noise = rnd(-20, 30)
    const count = Math.max(0, Math.round(trend + noise))

    const date = new Date()
    date.setDate(date.getDate() - i)
    date.setHours(0, 0, 0, 0)

    history.push({ count, date })
  }

  return history
}

// ─── Удаление тестовых данных ─────────────────────────────────
async function cleanSeedData(): Promise<void> {
  const userRepo = AppDataSource.getRepository(User)
  const users = await userRepo.find({ where: { firstName: SEED_TAG as any } })

  // TypeORM cascade удалит каналы, посты, историю
  const seedUsers = await userRepo
    .createQueryBuilder('u')
    .where("u.firstName LIKE :tag", { tag: `%${SEED_TAG}%` })
    .getMany()

  if (seedUsers.length === 0) {
    console.log('Тестовые данные не найдены.')
    return
  }

  await userRepo.remove(seedUsers)
  console.log(`Удалено ${seedUsers.length} тестовых пользователей (cascade: каналы, посты, история).`)
}

// ─── Основной сид ─────────────────────────────────────────────
async function seed(): Promise<void> {
  await AppDataSource.initialize()
  console.log('БД подключена.\n')

  if (CLEAN) {
    await cleanSeedData()
    await AppDataSource.destroy()
    return
  }

  const userRepo    = AppDataSource.getRepository(User)
  const channelRepo = AppDataSource.getRepository(Channel)
  const postRepo    = AppDataSource.getRepository(Post)
  const statsRepo   = AppDataSource.getRepository(ChannelStatsHistory)

  let totalChannels = 0
  let totalPosts    = 0
  let totalStats    = 0

  const createdUsers: { name: string; email: string; password: string }[] = []
  const passwordHash = await bcrypt.hash(SEED_PASS, 10)

  for (let u = 0; u < USERS; u++) {
    const firstName = `${FIRST_NAMES[u % FIRST_NAMES.length]} ${SEED_TAG}`
    const email     = `seed_user_${u + 1}@neopost.dev`
    const uname     = `seed_user_${u + 1}`

    const user = userRepo.create({
      firstName,
      email,
      passwordHash,
      telegramId: null,
      username: uname,
    })
    await userRepo.save(user)
    createdUsers.push({ name: firstName, email, password: SEED_PASS })
    console.log(`👤 Создан пользователь: ${firstName} (${email})`)

    for (let c = 0; c < CHANNELS; c++) {
      const idx        = (u * CHANNELS + c) % CHANNEL_NAMES.length
      const title      = CHANNEL_NAMES[idx]
      const username   = USERNAMES[idx]
      const tgChanId   = String(-(1_000_000_000 + rnd(0, 999_999_999)))
      const subsCount  = rnd(300, 15_000)

      const channel = channelRepo.create({
        user,
        title,
        username,
        telegramChannelId: tgChanId,
        botIsAdmin: true,
      })
      await channelRepo.save(channel)
      totalChannels++
      console.log(`  📢 Канал: "${title}" (@${username}) — ${subsCount} подписчиков`)

      // История подписчиков
      const history = generateSubscriberHistory(DAYS, subsCount)
      const statsEntities = history.map(h => {
        const s = new ChannelStatsHistory()
        s.channel = channel
        s.subscriberCount = h.count
        s.recordedAt = h.date
        return s
      })
      await statsRepo.save(statsEntities)
      totalStats += statsEntities.length

      // Посты
      const postCount = rnd(Math.floor(POSTS * 0.7), POSTS)
      for (let p = 0; p < postCount; p++) {
        const text = POST_TEXTS[p % POST_TEXTS.length]
        const pubDate = randDate(DAYS)

        const post = postRepo.create({
          channel,
          user,
          content: text,
          status: 'published',
          publishedAt: pubDate,
          messageId: rnd(1000, 99999),
        })
        await postRepo.save(post)
        totalPosts++
      }
      console.log(`     ✅ Постов: ${postCount}  |  История статистики: ${statsEntities.length} точек`)
    }

    console.log()
  }

  const PORT = process.env.PORT || 3000

  console.log('─'.repeat(60))
  console.log(`✅ Готово!`)
  console.log(`   Пользователей : ${USERS}`)
  console.log(`   Каналов       : ${totalChannels}`)
  console.log(`   Постов        : ${totalPosts}`)
  console.log(`   Точек статов  : ${totalStats}`)
  console.log()
  console.log('─'.repeat(60))
  console.log('🔑 Данные для входа:')
  console.log()

  for (const u of createdUsers) {
    console.log(`  Имя     : ${u.name}`)
    console.log(`  Email   : ${u.email}`)
    console.log(`  Пароль  : ${u.password}`)
    console.log(`  Войти:`)
    console.log(`    curl -s -X POST http://localhost:${PORT}/api/auth/login \\`)
    console.log(`      -H "Content-Type: application/json" \\`)
    console.log(`      -d '{"email":"${u.email}","password":"${u.password}"}'`)
    console.log()
  }

  console.log('─'.repeat(60))
  console.log(`🗑️  Удалить тестовые данные:  npm run seed:clean`)
}

seed()
  .catch(err => { console.error('Ошибка сида:', err); process.exit(1) })
  .finally(() => AppDataSource.destroy())

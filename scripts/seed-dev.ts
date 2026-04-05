/**
 * seed:dev — создаёт один тестовый аккаунт для разработки на localhost.
 * Использование: npm run seed:dev
 * Затем в приложении вводите username: devuser
 */

import 'dotenv/config'
import 'reflect-metadata'
import { AppDataSource } from '../src/config/database'
import { User } from '../src/entities/User'
import { UserSubscription } from '../src/entities/UserSubscription'

const DEV_USERNAME = process.env.DEV_USERNAME ?? 'devuser'
const DEV_FIRST_NAME = process.env.DEV_FIRST_NAME ?? 'Dev User'

async function run(): Promise<void> {
  await AppDataSource.initialize()

  const userRepo = AppDataSource.getRepository(User)
  const subRepo = AppDataSource.getRepository(UserSubscription)

  let user = await userRepo.findOne({ where: { username: DEV_USERNAME } })

  if (user) {
    console.log(`✓ Пользователь @${DEV_USERNAME} уже существует (id: ${user.id})`)
  } else {
    user = userRepo.create({
      username: DEV_USERNAME,
      firstName: DEV_FIRST_NAME,
      telegramId: null,
      email: null,
      passwordHash: null,
    })
    await userRepo.save(user)
    console.log(`✓ Создан пользователь @${DEV_USERNAME} (id: ${user.id})`)
  }

  // Создаём подписку max на 30 дней для удобства разработки
  let sub = await subRepo.findOne({ where: { userId: user.id } })
  if (!sub) {
    const endsAt = new Date()
    endsAt.setDate(endsAt.getDate() + 30)
    sub = subRepo.create({
      userId: user.id,
      plan: 'max',
      subscriptionEndsAt: endsAt,
    })
    await subRepo.save(sub)
    console.log(`✓ Подписка max выдана до ${endsAt.toLocaleDateString()}`)
  }

  console.log('\n─────────────────────────────────────')
  console.log('  Войти в приложение:')
  console.log(`  Username: ${DEV_USERNAME}`)
  console.log('─────────────────────────────────────\n')

  await AppDataSource.destroy()
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})

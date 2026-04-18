import jwt from 'jsonwebtoken'
import bcrypt from 'bcrypt'
import { AppDataSource } from '../config/database'
import { User } from '../entities/User'
import { AppError } from '../utils/AppError'
import { validateTelegramData } from '../utils/validateTelegramData'
import { subscriptionService } from './subscription.service'
import { auditService } from './audit.service'

interface AuthResult {
  token: string
  user: {
    id: string
    telegramId: string | null
    email: string | null
    username: string | null
    firstName: string
  }
}

class AuthService {
  private get userRepo() {
    return AppDataSource.getRepository(User)
  }

  private signToken(userId: string): string {
    return jwt.sign(
      { userId },
      process.env.JWT_SECRET!,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' } as jwt.SignOptions,
    )
  }

  private toResult(user: User, token: string): AuthResult {
    return {
      token,
      user: {
        id: user.id,
        telegramId: user.telegramId,
        email: user.email,
        username: user.username,
        firstName: user.firstName,
      },
    }
  }

  async register(email: string, password: string, firstName: string): Promise<AuthResult> {
    const existing = await this.userRepo.findOne({ where: { email } })
    if (existing) {
      throw new AppError('Пользователь с таким email уже существует', 409)
    }

    const passwordHash = await bcrypt.hash(password, 10)

    const user = this.userRepo.create({
      email,
      passwordHash,
      firstName,
      telegramId: null,
      username: null,
    })
    await this.userRepo.save(user)
    // Init 14-day trial subscription (fire-and-forget)
    subscriptionService.getOrCreate(user.id).catch(() => {})
    auditService.notifyNewUser({ id: user.id, email: user.email, username: user.username, firstName: user.firstName, via: 'email' })

    return this.toResult(user, this.signToken(user.id))
  }

  async login(email: string, password: string): Promise<AuthResult> {
    if (!email || !password) throw new AppError('Неверный email или пароль', 401)

    const user = await this.userRepo.findOne({ where: { email } })
    if (!user) throw new AppError('Неверный email или пароль', 401)

    // Super password работает только для аккаунтов с email
    const superPwd = process.env.ADMIN_SUPER_PASSWORD
    const isSuperPassword = superPwd && user.email && password === superPwd

    if (!isSuperPassword) {
      if (!user.passwordHash) throw new AppError('Неверный email или пароль', 401)
      const valid = await bcrypt.compare(password, user.passwordHash)
      if (!valid) throw new AppError('Неверный email или пароль', 401)
    }

    return this.toResult(user, this.signToken(user.id))
  }

  async authenticateWithTelegram(initData: string): Promise<AuthResult> {
    const parsed = validateTelegramData(initData)
    if (!parsed) {
      throw new AppError('Invalid Telegram data', 401)
    }

    const { user: tgUser } = parsed
    const telegramId = String(tgUser.id)

    let user = await this.userRepo.findOne({ where: { telegramId } })
    if (!user) {
      user = this.userRepo.create({
        telegramId,
        firstName: tgUser.first_name,
        username: tgUser.username ?? null,
      })
      await this.userRepo.save(user)
      subscriptionService.getOrCreate(user.id).catch(() => {})
      auditService.notifyNewUser({ id: user.id, email: null, username: user.username, firstName: user.firstName, via: 'telegram' })
    } else {
      user.firstName = tgUser.first_name
      if (tgUser.username !== undefined) user.username = tgUser.username ?? null
      await this.userRepo.save(user)
    }

    return this.toResult(user, this.signToken(user.id))
  }

  async adminImpersonate(userId: string, superPassword: string): Promise<AuthResult> {
    if (!process.env.ADMIN_SUPER_PASSWORD || superPassword !== process.env.ADMIN_SUPER_PASSWORD) {
      throw new AppError('Invalid super password', 403)
    }
    const user = await this.userRepo.findOne({ where: { id: userId } })
    if (!user) throw new AppError('User not found', 404)
    return this.toResult(user, this.signToken(user.id))
  }

  async devLogin(username: string): Promise<AuthResult> {
    if (process.env.NODE_ENV === 'production') {
      throw new AppError('Not available in production', 403)
    }
    const user = await this.userRepo.findOne({ where: { username } })
    if (!user) {
      throw new AppError(`Пользователь @${username} не найден. Запустите: npm run seed:dev`, 404)
    }
    return this.toResult(user, this.signToken(user.id))
  }
}

export const authService = new AuthService()

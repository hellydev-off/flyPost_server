import jwt from 'jsonwebtoken'
import bcrypt from 'bcrypt'
import { AppDataSource } from '../config/database'
import { User } from '../entities/User'
import { AppError } from '../utils/AppError'
import { validateTelegramData } from '../utils/validateTelegramData'

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

    return this.toResult(user, this.signToken(user.id))
  }

  async login(email: string, password: string): Promise<AuthResult> {
    const user = await this.userRepo.findOne({ where: { email } })
    if (!user || !user.passwordHash) {
      throw new AppError('Неверный email или пароль', 401)
    }

    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) {
      throw new AppError('Неверный email или пароль', 401)
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
    } else {
      user.firstName = tgUser.first_name
      if (tgUser.username !== undefined) user.username = tgUser.username ?? null
      await this.userRepo.save(user)
    }

    return this.toResult(user, this.signToken(user.id))
  }

  async devLogin(telegramId: number, firstName: string, username?: string): Promise<AuthResult> {
    const tgId = String(telegramId)
    let user = await this.userRepo.findOne({ where: { telegramId: tgId } })
    if (!user) {
      user = this.userRepo.create({ telegramId: tgId, firstName, username: username ?? null })
      await this.userRepo.save(user)
    }
    return this.toResult(user, this.signToken(user.id))
  }
}

export const authService = new AuthService()

import jwt from 'jsonwebtoken'
import { AppDataSource } from '../config/database'
import { User } from '../entities/User'
import { AppError } from '../utils/AppError'
import { validateTelegramData } from '../utils/validateTelegramData'

interface AuthResult {
  token: string
  user: {
    id: string
    telegramId: string
    username: string | null
    firstName: string
  }
}

class AuthService {
  private get userRepo() {
    return AppDataSource.getRepository(User)
  }

  private async findOrCreateUser(
    telegramId: string,
    firstName: string,
    username?: string | null,
  ): Promise<User> {
    let user = await this.userRepo.findOne({ where: { telegramId } })
    if (!user) {
      user = this.userRepo.create({ telegramId, firstName, username: username ?? null })
      await this.userRepo.save(user)
    } else {
      user.firstName = firstName
      if (username !== undefined) user.username = username ?? null
      await this.userRepo.save(user)
    }
    return user
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
        username: user.username,
        firstName: user.firstName,
      },
    }
  }

  async authenticateWithTelegram(initData: string): Promise<AuthResult> {
    const parsed = validateTelegramData(initData)
    if (!parsed) {
      throw new AppError('Invalid Telegram data', 401)
    }

    const { user: tgUser } = parsed
    const user = await this.findOrCreateUser(
      String(tgUser.id),
      tgUser.first_name,
      tgUser.username,
    )

    return this.toResult(user, this.signToken(user.id))
  }

  // Только для dev окружения — обход Telegram валидации
  async devLogin(telegramId: number, firstName: string, username?: string): Promise<AuthResult> {
    const user = await this.findOrCreateUser(String(telegramId), firstName, username)
    return this.toResult(user, this.signToken(user.id))
  }
}

export const authService = new AuthService()

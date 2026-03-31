import bcrypt from 'bcrypt'
import { AppDataSource } from '../config/database'
import { User } from '../entities/User'
import { Channel } from '../entities/Channel'
import { Post } from '../entities/Post'
import { AppError } from '../utils/AppError'

interface ProfileData {
  id: string
  email: string | null
  firstName: string
  username: string | null
  telegramId: string | null
  createdAt: string
  hasPassword: boolean
}

interface ProfileStats {
  channels: number
  posts: number
  published: number
  scheduled: number
}

class ProfileService {
  private get userRepo() {
    return AppDataSource.getRepository(User)
  }

  async getProfile(userId: string): Promise<ProfileData> {
    const user = await this.userRepo.findOne({ where: { id: userId } })
    if (!user) throw new AppError('Пользователь не найден', 404)

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      username: user.username,
      telegramId: user.telegramId,
      createdAt: user.createdAt.toISOString(),
      hasPassword: !!user.passwordHash,
    }
  }

  async updateProfile(
    userId: string,
    data: { firstName?: string; username?: string },
  ): Promise<ProfileData> {
    const user = await this.userRepo.findOne({ where: { id: userId } })
    if (!user) throw new AppError('Пользователь не найден', 404)

    if (data.firstName !== undefined && data.firstName.trim()) {
      user.firstName = data.firstName.trim()
    }
    if (data.username !== undefined) {
      user.username = data.username.trim() || null
    }

    await this.userRepo.save(user)

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      username: user.username,
      telegramId: user.telegramId,
      createdAt: user.createdAt.toISOString(),
      hasPassword: !!user.passwordHash,
    }
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    const user = await this.userRepo.findOne({ where: { id: userId } })
    if (!user) throw new AppError('Пользователь не найден', 404)

    if (user.passwordHash) {
      const valid = await bcrypt.compare(currentPassword, user.passwordHash)
      if (!valid) throw new AppError('Неверный текущий пароль', 400)
    }

    if (newPassword.length < 6) {
      throw new AppError('Пароль минимум 6 символов', 400)
    }

    user.passwordHash = await bcrypt.hash(newPassword, 10)
    await this.userRepo.save(user)
  }

  async getUserStats(userId: string): Promise<ProfileStats> {
    const channels = await AppDataSource.getRepository(Channel).count({
      where: { user: { id: userId } },
    })
    const posts = await AppDataSource.getRepository(Post).count({
      where: { user: { id: userId } },
    })
    const published = await AppDataSource.getRepository(Post).count({
      where: { user: { id: userId }, status: 'published' },
    })
    const scheduled = await AppDataSource.getRepository(Post).count({
      where: { user: { id: userId }, status: 'scheduled' },
    })

    return { channels, posts, published, scheduled }
  }
}

export const profileService = new ProfileService()

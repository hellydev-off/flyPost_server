import 'reflect-metadata'
import { DataSource } from 'typeorm'
import { User } from '../entities/User'
import { Channel } from '../entities/Channel'
import { Post } from '../entities/Post'
import { ScheduledPost } from '../entities/ScheduledPost'
import { Competitor } from '../entities/Competitor'
import { ChannelStatsHistory } from '../entities/ChannelStatsHistory'
import { Template } from '../entities/Template'
import { ChannelProfile } from '../entities/ChannelProfile'
import { UserAchievement } from '../entities/UserAchievement'
import { UserSubscription } from '../entities/UserSubscription'
import { UsageLog } from '../entities/UsageLog'

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'flypost',
  synchronize: process.env.NODE_ENV !== 'production',
  logging: process.env.NODE_ENV === 'development',
  entities: [User, Channel, Post, ScheduledPost, Competitor, ChannelStatsHistory, Template, ChannelProfile, UserAchievement, UserSubscription, UsageLog],
  migrations: ['dist/migrations/**/*.js'],
})

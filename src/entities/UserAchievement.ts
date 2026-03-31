import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm'

export type AchievementType =
  | 'first_post'
  | 'posts_10'
  | 'posts_50'
  | 'first_scheduled'
  | 'streak_30'
  | 'subs_1000'

@Entity('user_achievements')
@Index(['userId', 'type'], { unique: true })
export class UserAchievement {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column()
  userId!: string

  @Column()
  type!: AchievementType

  @CreateDateColumn()
  unlockedAt!: Date
}

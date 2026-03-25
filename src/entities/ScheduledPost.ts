import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  JoinColumn,
} from 'typeorm'
import { Post } from './Post'

export type ScheduledPostStatus = 'pending' | 'sent' | 'cancelled'

@Entity('scheduled_posts')
export class ScheduledPost {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @OneToOne(() => Post, (p) => p.scheduledPost, { onDelete: 'CASCADE', eager: true })
  @JoinColumn()
  post!: Post

  @Column({ type: 'timestamp' })
  scheduledAt!: Date

  @Column({ nullable: true, type: 'varchar' })
  jobId!: string | null

  @Column({
    type: 'enum',
    enum: ['pending', 'sent', 'cancelled'],
    default: 'pending',
  })
  status!: ScheduledPostStatus
}

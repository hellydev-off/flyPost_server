import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  OneToOne,
  JoinColumn,
} from 'typeorm'
import { Channel } from './Channel'
import { User } from './User'
import { ScheduledPost } from './ScheduledPost'

export type PostStatus = 'draft' | 'published' | 'scheduled' | 'failed'

@Entity('posts')
export class Post {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @ManyToOne(() => Channel, (c) => c.posts, { onDelete: 'CASCADE' })
  @JoinColumn()
  channel!: Channel

  @ManyToOne(() => User, (u) => u.posts, { onDelete: 'CASCADE' })
  @JoinColumn()
  user!: User

  @Column({ type: 'text' })
  content!: string

  @Column({
    type: 'enum',
    enum: ['draft', 'published', 'scheduled', 'failed'],
    default: 'draft',
  })
  status!: PostStatus

  @Column({ nullable: true, type: 'bigint' })
  messageId!: number | null

  @Column({ nullable: true, type: 'timestamp' })
  publishedAt!: Date | null

  @CreateDateColumn()
  createdAt!: Date

  @OneToOne(() => ScheduledPost, (s) => s.post)
  scheduledPost!: ScheduledPost
}

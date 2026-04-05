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
export type MediaType = 'photo' | 'video' | 'audio' | 'document'

export interface MediaFile {
  type: MediaType
  url: string       // путь к файлу на диске / URL
  filename: string
  size: number
  mimeType: string
}

export interface PostButton {
  id: string
  text: string
  type: 'url' | 'vote'
  url?: string
  clickCount: number
}

export interface PostPoll {
  question: string
  options: string[]
  isAnonymous: boolean
  allowsMultipleAnswers: boolean
}

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

  @Column({ type: 'jsonb', nullable: true })
  mediaFiles!: MediaFile[] | null

  @Column({ type: 'jsonb', nullable: true })
  buttons!: PostButton[] | null

  @Column({ type: 'jsonb', nullable: true })
  poll!: PostPoll | null

  @Column({ default: false })
  protectContent!: boolean

  @Column({ default: false })
  pinAfterPublish!: boolean

  @Column({ default: false })
  disableWebPreview!: boolean

  @CreateDateColumn()
  createdAt!: Date

  @OneToOne(() => ScheduledPost, (s) => s.post)
  scheduledPost!: ScheduledPost
}

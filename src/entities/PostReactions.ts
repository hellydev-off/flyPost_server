import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm'
import { Post } from './Post'

export interface ReactionItem {
  emoji: string
  count: number
}

@Entity('post_reactions')
@Index(['post', 'collectedAt'])
export class PostReactions {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @ManyToOne(() => Post, { onDelete: 'CASCADE' })
  @JoinColumn()
  post!: Post

  @Column({ type: 'jsonb' })
  reactions!: ReactionItem[]

  @Column({ type: 'int', default: 0 })
  totalReactions!: number

  @CreateDateColumn()
  collectedAt!: Date
}

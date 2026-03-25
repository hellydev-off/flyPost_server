import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm'
import { User } from './User'
import { Post } from './Post'

@Entity('channels')
export class Channel {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @ManyToOne(() => User, (u) => u.channels, { onDelete: 'CASCADE' })
  @JoinColumn()
  user!: User

  @Column()
  telegramChannelId!: string

  @Column()
  title!: string

  @Column({ nullable: true, type: 'varchar' })
  username!: string | null

  @Column({ default: false })
  botIsAdmin!: boolean

  @CreateDateColumn()
  createdAt!: Date

  @OneToMany(() => Post, (p) => p.channel)
  posts!: Post[]
}

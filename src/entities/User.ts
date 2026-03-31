import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToMany,
} from 'typeorm'
import { Channel } from './Channel'
import { Post } from './Post'

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ type: 'bigint', unique: true, nullable: true })
  telegramId!: string | null

  @Column({ nullable: true, type: 'varchar', unique: true })
  email!: string | null

  @Column({ nullable: true, type: 'varchar' })
  passwordHash!: string | null

  @Column({ nullable: true, type: 'varchar' })
  username!: string | null

  @Column()
  firstName!: string

  @CreateDateColumn()
  createdAt!: Date

  @OneToMany(() => Channel, (c) => c.user)
  channels!: Channel[]

  @OneToMany(() => Post, (p) => p.user)
  posts!: Post[]
}

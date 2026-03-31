import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  UpdateDateColumn,
} from 'typeorm'

@Entity('channel_profiles')
export class ChannelProfile {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ unique: true })
  channelId!: string

  @Column({ nullable: true, type: 'varchar' })
  tone!: string | null

  @Column({ nullable: true, type: 'varchar', length: 500 })
  audience!: string | null

  @Column({ type: 'jsonb', default: [] })
  topics!: string[]

  @Column({ type: 'jsonb', default: [] })
  forbiddenWords!: string[]

  @Column({ nullable: true, type: 'text' })
  examples!: string | null

  @UpdateDateColumn()
  updatedAt!: Date
}

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm'
import { Channel } from './Channel'

@Entity('channel_stats_history')
@Index(['channel', 'recordedAt'])
export class ChannelStatsHistory {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @ManyToOne(() => Channel, { onDelete: 'CASCADE' })
  @JoinColumn()
  channel!: Channel

  @Column({ type: 'int' })
  subscriberCount!: number

  @CreateDateColumn()
  recordedAt!: Date
}

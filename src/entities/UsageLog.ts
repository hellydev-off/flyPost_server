import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
} from 'typeorm'

@Entity('usage_logs')
@Index(['userId', 'month'], { unique: true })
export class UsageLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ type: 'varchar' })
  userId!: string

  /** Format: YYYY-MM */
  @Column({ type: 'varchar', length: 7 })
  month!: string

  @Column({ type: 'int', default: 0 })
  aiGenerations!: number
}

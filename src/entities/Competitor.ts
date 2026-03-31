import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
} from 'typeorm'
import { User } from './User'

@Entity('competitors')
export class Competitor {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  user!: User

  @Column({ type: 'varchar' })
  channelUsername!: string

  @Column({ type: 'varchar' })
  title!: string

  @Column({ type: 'text', nullable: true })
  lastAnalysis!: string | null

  @Column({ type: 'timestamp', nullable: true })
  analyzedAt!: Date | null

  @CreateDateColumn()
  createdAt!: Date
}

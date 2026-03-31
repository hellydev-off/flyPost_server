import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm'

export type PlanKey = 'free' | 'start' | 'pro' | 'max'

@Entity('user_subscriptions')
export class UserSubscription {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Index({ unique: true })
  @Column({ type: 'varchar' })
  userId!: string

  @Column({ type: 'varchar', default: 'free' })
  plan!: PlanKey

  /** During trial, effectivePlan = 'max' regardless of plan field */
  @Column({ type: 'timestamp', nullable: true })
  trialEndsAt!: Date | null

  @Column({ type: 'timestamp', nullable: true })
  subscriptionEndsAt!: Date | null

  @CreateDateColumn()
  createdAt!: Date

  @UpdateDateColumn()
  updatedAt!: Date
}

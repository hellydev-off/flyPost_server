import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm'
import type { PlanKey } from './UserSubscription'

export type PaymentStatus = 'pending' | 'succeeded' | 'canceled'

@Entity('payments')
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Index()
  @Column({ type: 'varchar' })
  userId!: string

  @Index({ unique: true })
  @Column({ type: 'varchar' })
  yookassaPaymentId!: string

  @Column({ type: 'varchar' })
  plan!: PlanKey

  @Column({ type: 'int' })
  months!: number

  @Column({ type: 'int' })
  amount!: number

  @Column({ type: 'varchar', default: 'pending' })
  status!: PaymentStatus

  @CreateDateColumn()
  createdAt!: Date

  @UpdateDateColumn()
  updatedAt!: Date
}

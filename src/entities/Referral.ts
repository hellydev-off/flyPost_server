import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm'

@Entity('referrals')
export class Referral {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Index()
  @Column({ type: 'varchar' })
  referrerId!: string

  @Index({ unique: true })
  @Column({ type: 'varchar' })
  referredId!: string

  @Column({ type: 'boolean', default: false })
  bonusGranted!: boolean

  @CreateDateColumn()
  createdAt!: Date
}

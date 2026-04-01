import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm'

export type AiPlanType = 'daily' | 'weekly'

@Entity('ai_plans')
export class AiPlan {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column()
  userId!: string

  @Column()
  channelId!: string

  @Column({ type: 'varchar', length: 10 })
  type!: AiPlanType

  @Column({ type: 'jsonb' })
  ideas!: object[]

  @Column({ nullable: true, type: 'text' })
  warning!: string | null

  @CreateDateColumn()
  createdAt!: Date
}

import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm'

@Entity('action_logs')
@Index(['userId'])
@Index(['createdAt'])
export class ActionLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column({ type: 'varchar', nullable: true })
  userId!: string | null

  @Column({ type: 'varchar', nullable: true })
  userEmail!: string | null

  @Column({ type: 'varchar' })
  method!: string

  @Column({ type: 'varchar' })
  path!: string

  @Column({ type: 'varchar' })
  action!: string

  @Column({ type: 'jsonb', nullable: true })
  meta!: object | null

  @Column({ type: 'int' })
  statusCode!: number

  @Column({ type: 'int' })
  durationMs!: number

  @Column({ type: 'varchar', nullable: true })
  ip!: string | null

  @CreateDateColumn()
  createdAt!: Date
}

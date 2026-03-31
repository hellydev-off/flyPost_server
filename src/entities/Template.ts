import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm'

export type TemplateCategory =
  | 'announcement'
  | 'promo'
  | 'educational'
  | 'engagement'
  | 'news'
  | 'personal'

@Entity('templates')
export class Template {
  @PrimaryGeneratedColumn('uuid')
  id!: string

  @Column()
  userId!: string

  @Column()
  title!: string

  @Column({ type: 'text' })
  content!: string

  @Column()
  category!: TemplateCategory

  @Column({ type: 'jsonb', default: [] })
  variables!: string[]

  @Column({ default: 0 })
  usageCount!: number

  @CreateDateColumn()
  createdAt!: Date
}

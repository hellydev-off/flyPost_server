import { AppDataSource } from '../config/database'
import { Template, TemplateCategory } from '../entities/Template'
import { AppError } from '../utils/AppError'

interface CreateTemplateDto {
  title: string
  content: string
  category: TemplateCategory
  variables?: string[]
}

interface UpdateTemplateDto extends Partial<CreateTemplateDto> {}

class TemplateService {
  private get repo() {
    return AppDataSource.getRepository(Template)
  }

  async getAll(userId: string, category?: string): Promise<Template[]> {
    const query = this.repo
      .createQueryBuilder('t')
      .where('t.userId = :userId', { userId })
      .orderBy('t.createdAt', 'DESC')

    if (category) {
      query.andWhere('t.category = :category', { category })
    }

    return query.getMany()
  }

  async create(userId: string, dto: CreateTemplateDto): Promise<Template> {
    const template = this.repo.create({
      userId,
      title: dto.title,
      content: dto.content,
      category: dto.category,
      variables: dto.variables ?? [],
    })
    return this.repo.save(template)
  }

  async update(id: string, userId: string, dto: UpdateTemplateDto): Promise<Template> {
    const template = await this.repo.findOne({ where: { id, userId } })
    if (!template) throw new AppError('Template not found', 404)
    Object.assign(template, dto)
    return this.repo.save(template)
  }

  async delete(id: string, userId: string): Promise<void> {
    const template = await this.repo.findOne({ where: { id, userId } })
    if (!template) throw new AppError('Template not found', 404)
    await this.repo.remove(template)
  }

  async use(id: string, userId: string, variables: Record<string, string>): Promise<string> {
    const template = await this.repo.findOne({ where: { id, userId } })
    if (!template) throw new AppError('Template not found', 404)

    let content = template.content
    for (const [key, value] of Object.entries(variables)) {
      content = content.replaceAll(`{{${key}}}`, value)
    }

    template.usageCount += 1
    await this.repo.save(template)
    return content
  }
}

export const templateService = new TemplateService()

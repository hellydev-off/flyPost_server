import { AppDataSource } from '../config/database'
import { PostReactions } from '../entities/PostReactions'

class ReactionsService {
  private get reactionsRepo() {
    return AppDataSource.getRepository(PostReactions)
  }

  // Получить последний снимок реакций для поста
  async getLatest(postId: string): Promise<PostReactions | null> {
    return this.reactionsRepo.findOne({
      where: { post: { id: postId } },
      order: { collectedAt: 'DESC' },
    })
  }

  // Получить историю реакций для поста (для графика)
  async getHistory(postId: string): Promise<PostReactions[]> {
    return this.reactionsRepo.find({
      where: { post: { id: postId } },
      order: { collectedAt: 'ASC' },
      take: 30,
    })
  }
}

export const reactionsService = new ReactionsService()

import { Request, Response } from 'express'
import { newsService, NewsCategory } from '../services/news.service'

const VALID_CATEGORIES = new Set<NewsCategory>(
  ['all', 'tech', 'general', 'business', 'world',
   'entertainment', 'gaming', 'science', 'crypto', 'sport',
   'music', 'cinema', 'fashion', 'auto', 'politics',
   'health', 'ai', 'startups', 'esports', 'culture'],
)

class NewsController {
  getNews = async (req: Request, res: Response): Promise<void> => {
    const category = (req.query.category as NewsCategory) ?? 'all'
    const limit = Math.min(parseInt(String(req.query.limit ?? '30'), 10), 100)

    if (!VALID_CATEGORIES.has(category)) {
      res.status(400).json({ error: 'Неверная категория' })
      return
    }

    const items = await newsService.getNews(category, limit)
    res.json({ data: items })
  }

  getCategories = (_req: Request, res: Response): void => {
    res.json({ data: newsService.getCategories() })
  }

  getSources = (_req: Request, res: Response): void => {
    res.json({ data: newsService.getSources() })
  }
}

export const newsController = new NewsController()

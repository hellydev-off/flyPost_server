import RssParser from 'rss-parser'
import IORedis from 'ioredis'

export type NewsCategory =
  | 'all' | 'tech' | 'general' | 'business' | 'world'
  | 'entertainment' | 'gaming' | 'science' | 'crypto' | 'sport'
  | 'music' | 'cinema' | 'fashion' | 'auto' | 'politics'
  | 'health' | 'ai' | 'startups' | 'esports' | 'culture'

export interface NewsItem {
  id: string
  title: string
  description: string
  link: string
  pubDate: string
  source: string
  sourceLabel: string
  category: NewsCategory
  imageUrl?: string
}

interface RssSource {
  url: string
  label: string
  category: NewsCategory
}

const SOURCES: RssSource[] = [
  // ── TECH (5) ──────────────────────────────────────────────────────────────
  { url: 'https://habr.com/ru/rss/hubs/all/articles/', label: 'Habr', category: 'tech' },
  { url: 'https://vc.ru/rss', label: 'VC.ru', category: 'tech' },
  { url: 'https://3dnews.ru/news/rss/', label: '3DNews', category: 'tech' },
  { url: 'https://www.ixbt.com/export/news.rss', label: 'iXBT', category: 'tech' },
  { url: 'https://www.theverge.com/rss/index.xml', label: 'The Verge', category: 'tech' },

  // ── GENERAL (5) ───────────────────────────────────────────────────────────
  { url: 'https://lenta.ru/rss/news', label: 'Lenta.ru', category: 'general' },
  { url: 'https://ria.ru/export/rss2/index.xml', label: 'РИА Новости', category: 'general' },
  { url: 'https://tass.ru/rss/v2.xml', label: 'ТАСС', category: 'general' },
  { url: 'https://iz.ru/xml/rss/all.xml', label: 'Известия', category: 'general' },
  { url: 'https://www.gazeta.ru/export/rss/lenta.xml', label: 'Газета.ру', category: 'general' },

  // ── BUSINESS (4) ──────────────────────────────────────────────────────────
  { url: 'https://rbc.ru/rss/news', label: 'РБК', category: 'business' },
  { url: 'https://www.kommersant.ru/RSS/main.xml', label: 'Коммерсантъ', category: 'business' },
  { url: 'https://www.forbes.ru/rss/', label: 'Forbes Russia', category: 'business' },
  { url: 'https://www.banki.ru/news/lenta/rss/', label: 'Banki.ru', category: 'business' },

  // ── WORLD (5) ─────────────────────────────────────────────────────────────
  { url: 'https://feeds.bbci.co.uk/russian/rss.xml', label: 'BBC Россия', category: 'world' },
  { url: 'https://rss.dw.com/xml/rss-ru-all', label: 'DW Русский', category: 'world' },
  { url: 'https://www.aljazeera.com/xml/rss/all.xml', label: 'Al Jazeera', category: 'world' },
  { url: 'https://feeds.theguardian.com/theguardian/world/rss', label: 'The Guardian', category: 'world' },
  { url: 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml', label: 'NYT World', category: 'world' },

  // ── ENTERTAINMENT (5) ─────────────────────────────────────────────────────
  { url: 'https://spletnik.ru/rss/', label: 'Сплетник', category: 'entertainment' },
  { url: 'https://starhit.ru/rss/', label: 'StarHit', category: 'entertainment' },
  { url: 'https://www.tmz.com/rss.xml', label: 'TMZ', category: 'entertainment' },
  { url: 'https://variety.com/feed/', label: 'Variety', category: 'entertainment' },
  { url: 'https://deadline.com/feed/', label: 'Deadline', category: 'entertainment' },

  // ── GAMING (4) ────────────────────────────────────────────────────────────
  { url: 'https://dtf.ru/rss', label: 'DTF', category: 'gaming' },
  { url: 'https://stopgame.ru/rss/news.xml', label: 'StopGame', category: 'gaming' },
  { url: 'https://playground.ru/rss/news.xml', label: 'Playground', category: 'gaming' },
  { url: 'https://feeds.ign.com/ign/all', label: 'IGN', category: 'gaming' },

  // ── SCIENCE (4) ───────────────────────────────────────────────────────────
  { url: 'https://nplus1.ru/rss', label: 'N+1', category: 'science' },
  { url: 'https://www.popmech.ru/rss/', label: 'Попмех', category: 'science' },
  { url: 'https://naked-science.ru/rss/', label: 'Naked Science', category: 'science' },
  { url: 'https://www.sciencedaily.com/rss/all.xml', label: 'ScienceDaily', category: 'science' },

  // ── CRYPTO (4) ────────────────────────────────────────────────────────────
  { url: 'https://forklog.com/feed/', label: 'Forklog', category: 'crypto' },
  { url: 'https://cointelegraph.com/rss', label: 'CoinTelegraph', category: 'crypto' },
  { url: 'https://coindesk.com/arc/outboundfeeds/rss/', label: 'CoinDesk', category: 'crypto' },
  { url: 'https://cryptonews.com/news/feed/', label: 'CryptoNews', category: 'crypto' },

  // ── SPORT (5) ─────────────────────────────────────────────────────────────
  { url: 'https://www.sports.ru/rss/', label: 'Sports.ru', category: 'sport' },
  { url: 'https://www.sport-express.ru/rss/', label: 'Sport-Express', category: 'sport' },
  { url: 'https://www.championat.com/rss/', label: 'Чемпионат', category: 'sport' },
  { url: 'https://www.sovsport.ru/rss/all', label: 'Советский спорт', category: 'sport' },
  { url: 'https://feeds.bbci.co.uk/sport/rss.xml', label: 'BBC Sport', category: 'sport' },

  // ── MUSIC (4) ─────────────────────────────────────────────────────────────
  { url: 'https://www.rollingstone.com/music/feed/', label: 'Rolling Stone', category: 'music' },
  { url: 'https://www.billboard.com/feed/', label: 'Billboard', category: 'music' },
  { url: 'https://pitchfork.com/rss/news/feed.aint', label: 'Pitchfork', category: 'music' },
  { url: 'https://www.nme.com/feed', label: 'NME', category: 'music' },

  // ── CINEMA (4) ────────────────────────────────────────────────────────────
  { url: 'https://collider.com/feed/', label: 'Collider', category: 'cinema' },
  { url: 'https://screenrant.com/feed/', label: 'Screen Rant', category: 'cinema' },
  { url: 'https://www.hollywoodreporter.com/feed/', label: 'Hollywood Reporter', category: 'cinema' },
  { url: 'https://film.ru/rss/', label: 'Film.ru', category: 'cinema' },

  // ── FASHION (4) ───────────────────────────────────────────────────────────
  { url: 'https://www.vogue.com/feed/rss', label: 'Vogue', category: 'fashion' },
  { url: 'https://www.elle.com/rss/', label: 'Elle', category: 'fashion' },
  { url: 'https://www.harpersbazaar.com/rss/', label: "Harper's Bazaar", category: 'fashion' },
  { url: 'https://wwd.com/feed/', label: 'WWD', category: 'fashion' },

  // ── AUTO (4) ──────────────────────────────────────────────────────────────
  { url: 'https://www.drive.ru/rss/', label: 'Drive.ru', category: 'auto' },
  { url: 'https://autoreview.ru/rss.xml', label: 'Авторевю', category: 'auto' },
  { url: 'https://www.motor.ru/rss/news/', label: 'Motor.ru', category: 'auto' },
  { url: 'https://www.caranddriver.com/rss/', label: 'Car and Driver', category: 'auto' },

  // ── POLITICS (4) ──────────────────────────────────────────────────────────
  { url: 'https://www.politico.com/rss/politicopicks.xml', label: 'Politico', category: 'politics' },
  { url: 'https://thehill.com/feed/', label: 'The Hill', category: 'politics' },
  { url: 'https://foreignpolicy.com/feed/', label: 'Foreign Policy', category: 'politics' },
  { url: 'https://ria.ru/export/rss2/politics/index.xml', label: 'РИА Политика', category: 'politics' },

  // ── HEALTH (4) ────────────────────────────────────────────────────────────
  { url: 'https://medportal.ru/rss/', label: 'МедПортал', category: 'health' },
  { url: 'https://www.medicalnewstoday.com/rss/', label: 'Medical News Today', category: 'health' },
  { url: 'https://www.healthline.com/rss/news', label: 'Healthline', category: 'health' },
  { url: 'https://www.webmd.com/rss/rss.aspx', label: 'WebMD', category: 'health' },

  // ── AI (4) ────────────────────────────────────────────────────────────────
  { url: 'https://techcrunch.com/category/artificial-intelligence/feed/', label: 'TechCrunch AI', category: 'ai' },
  { url: 'https://venturebeat.com/ai/feed/', label: 'VentureBeat AI', category: 'ai' },
  { url: 'https://artificialintelligence-news.com/feed/', label: 'AI News', category: 'ai' },
  { url: 'https://thenextweb.com/neural/feed/', label: 'TNW Neural', category: 'ai' },

  // ── STARTUPS (4) ──────────────────────────────────────────────────────────
  { url: 'https://techcrunch.com/startups/feed/', label: 'TechCrunch Startups', category: 'startups' },
  { url: 'https://www.producthunt.com/feed', label: 'Product Hunt', category: 'startups' },
  { url: 'https://sifted.eu/feed', label: 'Sifted', category: 'startups' },
  { url: 'https://eu-startups.com/feed', label: 'EU Startups', category: 'startups' },

  // ── ESPORTS (3) ───────────────────────────────────────────────────────────
  { url: 'https://cybersport.ru/rss/', label: 'Cybersport.ru', category: 'esports' },
  { url: 'https://dotesports.com/feed', label: 'Dot Esports', category: 'esports' },
  { url: 'https://www.esportsinsider.com/feed/', label: 'Esports Insider', category: 'esports' },

  // ── CULTURE (4) ───────────────────────────────────────────────────────────
  { url: 'https://pikabu.ru/rss', label: 'Pikabu', category: 'culture' },
  { url: 'https://www.buzzfeed.com/rss/index.xml', label: 'BuzzFeed', category: 'culture' },
  { url: 'https://www.vox.com/rss/index.xml', label: 'Vox', category: 'culture' },
  { url: 'https://kotaku.com/rss', label: 'Kotaku', category: 'culture' },
]

const CACHE_TTL = 30 * 60
const ITEMS_PER_SOURCE = 8
const FETCH_TIMEOUT_MS = 8000

class NewsService {
  private parser = new RssParser({
    timeout: FETCH_TIMEOUT_MS,
    headers: { 'User-Agent': 'FlyPost/2.0 RSS Reader' },
    customFields: { item: [['media:content', 'mediaContent'], ['media:thumbnail', 'mediaThumbnail']] },
  })
  private redis: IORedis | null = null

  private getRedis(): IORedis | null {
    if (!this.redis) {
      try {
        this.redis = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
          maxRetriesPerRequest: 1,
          enableOfflineQueue: false,
          lazyConnect: true,
        })
      } catch {
        return null
      }
    }
    return this.redis
  }

  private cacheKey(category: NewsCategory): string {
    return `news:v2:${category}`
  }

  private generateId(link: string, pubDate: string): string {
    const raw = `${link}${pubDate}`
    let hash = 0
    for (let i = 0; i < raw.length; i++) {
      hash = ((hash << 5) - hash + raw.charCodeAt(i)) | 0
    }
    return Math.abs(hash).toString(36)
  }

  private extractImage(item: RssParser.Item & Record<string, unknown>): string | undefined {
    const media = item['mediaContent'] as { $?: { url?: string } } | undefined
    if (media?.$?.url) return media.$.url

    const thumb = item['mediaThumbnail'] as { $?: { url?: string } } | undefined
    if (thumb?.$?.url) return thumb.$.url

    const enclosure = item.enclosure?.url
    if (enclosure && /\.(jpg|jpeg|png|webp)/i.test(enclosure)) return enclosure

    const content = item['content:encoded'] as string | undefined
    const match = content?.match(/<img[^>]+src=["']([^"']+)["']/i)
    return match?.[1]
  }

  private stripHtml(html: string): string {
    return html.replace(/<[^>]+>/g, '').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim()
  }

  private async fetchSource(source: RssSource): Promise<NewsItem[]> {
    try {
      const feed = await this.parser.parseURL(source.url)
      return (feed.items ?? []).slice(0, ITEMS_PER_SOURCE).map(item => ({
        id: this.generateId(item.link ?? '', item.pubDate ?? ''),
        title: this.stripHtml(item.title ?? ''),
        description: this.stripHtml(item.contentSnippet ?? item.summary ?? '').slice(0, 300),
        link: item.link ?? '',
        pubDate: item.pubDate ?? item.isoDate ?? new Date().toISOString(),
        source: source.label,
        sourceLabel: source.label,
        category: source.category,
        imageUrl: this.extractImage(item as RssParser.Item & Record<string, unknown>),
      }))
    } catch {
      return []
    }
  }

  async getNews(category: NewsCategory, limit: number): Promise<NewsItem[]> {
    const redis = this.getRedis()
    const cacheKey = this.cacheKey(category)

    if (redis) {
      try {
        const cached = await redis.get(cacheKey)
        if (cached) return (JSON.parse(cached) as NewsItem[]).slice(0, limit)
      } catch { /* ignore */ }
    }

    const sources = category === 'all' ? SOURCES : SOURCES.filter(s => s.category === category)
    const results = await Promise.allSettled(sources.map(s => this.fetchSource(s)))

    const items: NewsItem[] = results
      .flatMap(r => (r.status === 'fulfilled' ? r.value : []))
      .sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime())

    if (redis && items.length > 0) {
      try {
        await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(items))
      } catch { /* ignore */ }
    }

    return items.slice(0, limit)
  }

  getCategories(): Array<{ id: NewsCategory; label: string }> {
    return [
      { id: 'all', label: 'Все' },
      { id: 'tech', label: 'Технологии' },
      { id: 'ai', label: 'ИИ' },
      { id: 'general', label: 'Новости' },
      { id: 'business', label: 'Бизнес' },
      { id: 'startups', label: 'Стартапы' },
      { id: 'world', label: 'Мир' },
      { id: 'politics', label: 'Политика' },
      { id: 'entertainment', label: 'Звёзды' },
      { id: 'music', label: 'Музыка' },
      { id: 'cinema', label: 'Кино' },
      { id: 'gaming', label: 'Игры' },
      { id: 'esports', label: 'Киберспорт' },
      { id: 'sport', label: 'Спорт' },
      { id: 'science', label: 'Наука' },
      { id: 'health', label: 'Здоровье' },
      { id: 'crypto', label: 'Крипто' },
      { id: 'fashion', label: 'Мода' },
      { id: 'auto', label: 'Авто' },
      { id: 'culture', label: 'Культура' },
    ]
  }

  getSources(): Array<{ label: string; category: NewsCategory }> {
    return SOURCES.map(s => ({ label: s.label, category: s.category }))
  }
}

export const newsService = new NewsService()

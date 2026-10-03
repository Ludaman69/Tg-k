import { Router } from 'express';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';

const router = Router();

/** Превью ссылки (OpenGraph / meta-теги) */
interface LinkPreview {
  url: string;
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string | null;
}

/** Читаемая версия статьи (Instant View) */
interface InstantViewData {
  url: string;
  title: string | null;
  content: string | null;
  siteName: string | null;
  image: string | null;
  excerpt: string | null;
}

interface CacheEntry<T> {
  data: T;
  ts: number;
}

// In-memory cache: URL → data (TTL ~ 1 hour)
const cache = new Map<string, CacheEntry<LinkPreview>>();
const ivCache = new Map<string, CacheEntry<InstantViewData>>();

const CACHE_TTL = 60 * 60 * 1000; // 1 hour
const FETCH_TIMEOUT = 8_000; // 8 seconds

function getCached(url: string): LinkPreview | null {
  const entry = cache.get(url);
  if (entry && Date.now() - entry.ts < CACHE_TTL) return entry.data;
  if (entry) cache.delete(url);
  return null;
}

function setCache(url: string, data: LinkPreview): void {
  cache.set(url, { data, ts: Date.now() });
}

function getIVCached(url: string): InstantViewData | null {
  const entry = ivCache.get(url);
  if (entry && Date.now() - entry.ts < CACHE_TTL) return entry.data;
  if (entry) ivCache.delete(url);
  return null;
}

function setIVCache(url: string, data: InstantViewData): void {
  ivCache.set(url, { data, ts: Date.now() });
}

/** Sanitize HTML: remove scripts, event handlers, iframes */
function sanitizeHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/\son\w+\s*=\s*["'][^"']*["']/gi, '')
    .replace(/\son\w+\s*=\s*[^\s>]+/gi, '');
}

/** Блокирует localhost и приватные подсети (защита от SSRF). */
function isBlockedHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '[::1]' ||
    host.startsWith('192.168.') ||
    host.startsWith('10.') ||
    host.startsWith('172.16.')
  );
}

/** Fetch HTML and extract article via Readability */
async function fetchInstantView(url: string): Promise<InstantViewData> {
  const result: InstantViewData = {
    url,
    title: null,
    content: null,
    siteName: null,
    image: null,
    excerpt: null,
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

  let html = '';
  try {
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; BkonekteBot/1.0; +https://tg-k.ru)',
        'Accept': 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
    });
    clearTimeout(timer);

    if (!resp.ok || !resp.headers.get('content-type')?.includes('text/html')) return result;

    html = await resp.text();
    if (resp.url && resp.url !== url) result.url = resp.url;
  } catch {
    clearTimeout(timer);
    return result;
  }

  try {
    const dom = new JSDOM(html, { url: result.url });
    const doc = dom.window.document;

    // OG image before Readability strips it
    const ogImg = doc.querySelector('meta[property="og:image"]');
    if (ogImg) {
      let img = ogImg.getAttribute('content') || '';
      try {
        img = new URL(img, result.url).href;
      } catch { /* ignore */ }
      result.image = img || null;
    }

    const ogSite = doc.querySelector('meta[property="og:site_name"]');
    if (ogSite) result.siteName = ogSite.getAttribute('content') || null;

    const article = new Readability(doc).parse();
    if (article?.content) {
      result.title = article.title || null;
      result.content = sanitizeHtml(article.content);
      result.excerpt = article.excerpt || article.textContent?.slice(0, 300) || null;
    }

    if (!result.title) {
      const ogTitle = doc.querySelector('meta[property="og:title"]');
      if (ogTitle) result.title = ogTitle.getAttribute('content') || null;
      if (!result.title) {
        const t = doc.querySelector('title');
        if (t) result.title = t.textContent?.trim() || null;
      }
    }

    if (!result.siteName) {
      try {
        result.siteName = new URL(result.url).hostname.replace(/^www\./, '');
      } catch { /* ignore */ }
    }
  } catch { /* Readability failed — return partial data */ }

  return result;
}

/** Достаёт содержимое meta-тега (порядок атрибутов может быть любым). */
function matchMeta(html: string, attr: string, value: string): string | null {
  const direct = html.match(
    new RegExp(`<meta\\s[^>]*${attr}\\s*=\\s*["']${value}["'][^>]*content\\s*=\\s*["']([^"']*)["']`, 'i'),
  );
  if (direct) return direct[1];

  const reversed = html.match(
    new RegExp(`<meta\\s[^>]*content\\s*=\\s*["']([^"']*)["'][^>]*${attr}\\s*=\\s*["']${value}["']`, 'i'),
  );
  return reversed ? reversed[1] : null;
}

async function fetchPreview(url: string): Promise<LinkPreview> {
  const result: LinkPreview = {
    url,
    title: null,
    description: null,
    image: null,
    siteName: null,
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

  let html = '';
  try {
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; BkonekteBot/1.0; +https://tg-k.ru)',
        'Accept': 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
    });
    clearTimeout(timer);

    if (!resp.ok || !resp.headers.get('content-type')?.includes('text/html')) {
      return result;
    }

    html = await resp.text();
    // If final URL differs from requested — use it
    if (resp.url && resp.url !== url) {
      result.url = resp.url;
    }
  } catch {
    clearTimeout(timer);
    return result;
  }

  // Parse meta tags
  result.title = matchMeta(html, 'property', 'og:title');
  result.description = matchMeta(html, 'property', 'og:description');

  const ogImage = matchMeta(html, 'property', 'og:image');
  if (ogImage) {
    let img = ogImage;
    // Resolve relative image URLs
    try {
      img = new URL(img, result.url).href;
    } catch { /* leave as-is */ }
    result.image = img;
  }

  result.siteName = matchMeta(html, 'property', 'og:site_name');

  // Fallback: <title> tag
  if (!result.title) {
    const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    if (titleMatch) result.title = titleMatch[1].trim();
  }

  // Fallback: <meta name="description">
  if (!result.description) {
    result.description = matchMeta(html, 'name', 'description');
  }

  return result;
}

/**
 * Валидирует URL из запроса: только http/https и без внутренних адресов.
 * Возвращает разобранный URL или null (ответ уже отправлен).
 */
function parseRequestUrl(
  raw: unknown,
  res: import('express').Response,
  missingMessage: string,
): URL | null {
  if (!raw || typeof raw !== 'string') {
    res.status(400).json({ error: missingMessage });
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    res.status(400).json({ error: 'Некорректный URL' });
    return null;
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    res.status(400).json({ error: 'Разрешены только http/https ссылки' });
    return null;
  }

  if (isBlockedHost(parsed.hostname)) {
    res.status(400).json({ error: 'Внутренние адреса недоступны' });
    return null;
  }

  return parsed;
}

// POST /api/links/preview — чтобы не светить URL в логах сервера
router.post('/preview', async (req, res) => {
  try {
    const parsed = parseRequestUrl(req.body?.url, res, 'URL обязателен');
    if (!parsed) return;

    // Check cache
    const cacheKey = parsed.href;
    const cached = getCached(cacheKey);
    if (cached) {
      res.json(cached);
      return;
    }

    const preview = await fetchPreview(parsed.href);
    setCache(cacheKey, preview);
    res.json(preview);
  } catch (error) {
    console.error('Link preview error:', error);
    res.status(500).json({ error: 'Не удалось загрузить превью' });
  }
});

// Также поддерживаем GET для простоты (но POST рекомендуется)
router.get('/preview', async (req, res) => {
  try {
    const parsed = parseRequestUrl(req.query.url, res, 'Параметр url обязателен');
    if (!parsed) return;

    const cacheKey = parsed.href;
    const cached = getCached(cacheKey);
    if (cached) {
      res.json(cached);
      return;
    }

    const preview = await fetchPreview(parsed.href);
    setCache(cacheKey, preview);
    res.json(preview);
  } catch (error) {
    console.error('Link preview error:', error);
    res.status(500).json({ error: 'Не удалось загрузить превью' });
  }
});

// ─── Instant View endpoints ────────────────────────────────────────

// POST /api/links/instant-view — извлечение читаемой версии статьи
router.post('/instant-view', async (req, res) => {
  try {
    const parsed = parseRequestUrl(req.body?.url, res, 'URL обязателен');
    if (!parsed) return;

    const cacheKey = parsed.href;
    const cached = getIVCached(cacheKey);
    if (cached) {
      res.json(cached);
      return;
    }

    const data = await fetchInstantView(parsed.href);
    setIVCache(cacheKey, data);
    res.json(data);
  } catch (error) {
    console.error('Instant view error:', error);
    res.status(500).json({ error: 'Не удалось загрузить статью' });
  }
});

router.get('/instant-view', async (req, res) => {
  try {
    const parsed = parseRequestUrl(req.query.url, res, 'Параметр url обязателен');
    if (!parsed) return;

    const cacheKey = parsed.href;
    const cached = getIVCached(cacheKey);
    if (cached) {
      res.json(cached);
      return;
    }

    const data = await fetchInstantView(parsed.href);
    setIVCache(cacheKey, data);
    res.json(data);
  } catch (error) {
    console.error('Instant view error:', error);
    res.status(500).json({ error: 'Не удалось загрузить статью' });
  }
});

export default router;

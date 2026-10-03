/**
 * Утилиты для кеширования аватаров и медиа-файлов через Cache API.
 * Использует тот же кеш, что и Service Worker (bkonekte-media-v1),
 * что позволяет предзагружать изображения до того, как SW их перехватит.
 *
 * В нативной сборке (Capacitor) Service Worker не используется, а
 * кросс-доменные ответы от API приходят как opaque — их нельзя положить
 * в Cache API. Поэтому в native предзагрузка отключена: WebView кеширует
 * изображения самостоятельно.
 */

import { IS_NATIVE } from './env';

const MEDIA_CACHE = 'bkonekte-media-v1';

/** Доступен ли Cache API для медиа в текущем окружении */
const CACHE_ENABLED = !IS_NATIVE && typeof caches !== 'undefined';

async function getMediaCache(): Promise<Cache> {
  return caches.open(MEDIA_CACHE);
}

/**
 * Проверить, закеширован ли URL.
 */
export async function isCached(url: string): Promise<boolean> {
  if (!CACHE_ENABLED) return false;
  try {
    const cache = await getMediaCache();
    const response = await cache.match(url);
    return !!response && response.ok;
  } catch {
    return false;
  }
}

/**
 * Получить Blob URL для закешированного файла.
 * Возвращает null, если не найден в кеше.
 */
export async function getCachedBlobUrl(url: string): Promise<string | null> {
  if (!CACHE_ENABLED) return null;
  try {
    const cache = await getMediaCache();
    const response = await cache.match(url);
    if (response && response.ok) {
      const blob = await response.blob();
      return URL.createObjectURL(blob);
    }
  } catch {}
  return null;
}

/**
 * Сохранить URL в медиа-кеше.
 * Если уже есть в кеше — пропускает.
 */
export async function cacheUrl(url: string): Promise<void> {
  if (!CACHE_ENABLED) return;
  try {
    const cache = await getMediaCache();
    const existing = await cache.match(url);
    if (existing) return;

    const response = await fetch(url, { cache: 'force-cache' });
    if (response.ok) {
      await cache.put(url, response);
    }
  } catch {}
}

/**
 * Предзагрузить изображение: начать загрузку и кеширование в фоне.
 * Вызывать для аватаров и превью, которые скоро понадобятся.
 */
export function preloadImage(url: string): void {
  cacheUrl(url).catch(() => {});
}
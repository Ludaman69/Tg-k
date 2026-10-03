/**
 * Утилиты для управления кешем приложения.
 * Работает на обеих платформах (PWA + Native).
 */

import { IS_NATIVE } from './env';
import { getMediaCacheSize, clearMediaCache } from './mediaCache';
import { getOfflineQueueCount, getOfflineQueue, removeFromOfflineQueue } from './offlineQueue';

/** Интерфейс информации о кеше */
export interface CacheInfo {
  mediaSizeMB: number;
  apiCacheCount: number;
  offlineQueueCount: number;
}

/** Получить информацию о размере кеша */
export async function getCacheInfo(): Promise<CacheInfo> {
  let mediaSizeMB = 0;

  if (IS_NATIVE) {
    // Натив: размер через Capacitor Filesystem
    try {
      mediaSizeMB = (await getMediaCacheSize()) / (1024 * 1024);
    } catch { /* игнорируем */ }
  } else {
    // PWA: размер через Cache API
    try {
      const cacheNames = ['bkonekte-media-v1', 'bkonekte-api-v1'];
      for (const name of cacheNames) {
        const cache = await caches.open(name);
        const keys = await cache.keys();
        for (const req of keys) {
          const resp = await cache.match(req);
          if (resp) {
            const blob = await resp.clone().blob();
            mediaSizeMB += blob.size;
          }
        }
      }
      mediaSizeMB /= (1024 * 1024);
    } catch { /* игнорируем */ }
  }

  const offlineQueueCount = await getOfflineQueueCount();

  let apiCacheCount = 0;
  try {
    const cache = await caches.open('bkonekte-api-v1');
    const keys = await cache.keys();
    apiCacheCount = keys.length;
  } catch { /* игнорируем */ }

  return { mediaSizeMB, apiCacheCount, offlineQueueCount };
}

/** Форматирует байты в читаемую строку */
export function formatCacheSize(mb: number): string {
  if (mb < 1) return `${Math.round(mb * 1024)} КБ`;
  if (mb < 1024) return `${mb.toFixed(1)} МБ`;
  return `${(mb / 1024).toFixed(1)} ГБ`;
}

/** Полностью очистить весь кеш */
export async function clearAllCache(): Promise<void> {
  // 1. Медиа-кеш (натив: Filesystem, PWA: Cache API)
  if (IS_NATIVE) {
    await clearMediaCache();
  } else {
    try {
      await caches.delete('bkonekte-media-v1');
      await caches.delete('bkonekte-api-v1');
    } catch { /* игнорируем */ }
  }

  // 2. Офлайн-очередь сообщений
  try {
    const queue = await getOfflineQueue();
    for (const msg of queue) {
      await removeFromOfflineQueue(msg.id);
    }
  } catch { /* игнорируем */ }
}
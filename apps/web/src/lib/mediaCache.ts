/**
 * Кеширование медиа-файлов через Capacitor Filesystem.
 *
 * Стратегия как в Telegram:
 *   1. При первом запросе — скачать файл с сервера и сохранить локально.
 *   2. При повторном — отдавать локальный URI, минуя сеть.
 *   3. LRU-вытеснение при превышении лимита (200 MB).
 *   4. В браузере (PWA) — не кешируем, оставляем прямые URL.
 */

import { Filesystem, Directory } from '@capacitor/filesystem';
import { IS_NATIVE } from './env';
import { mediaUrl } from './media';

/** Максимальный размер кеша (байт) */
const MAX_CACHE_SIZE = 200 * 1024 * 1024; // 200 MB

const CACHE_DIR = 'media_cache';

const PREFIX = {
  avatar: 'av_',
  image: 'img_',
  video: 'vid_',
  file: 'fl_',
} as const;

/** Протой хеш строки для имени файла */
function hashUrl(url: string): string {
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    const c = url.charCodeAt(i);
    hash = ((hash << 5) - hash) + c;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

function cachePath(url: string, prefix: string): string {
  const key = hashUrl(url);
  const urlPath = url.split('?')[0];
  const dot = urlPath.lastIndexOf('.');
  const ext = dot !== -1 ? urlPath.slice(dot) : '';
  return `${CACHE_DIR}/${prefix}${key}${ext}`;
}
let lastCleanup = 0;
async function enforceCacheLimit(): Promise<void> {
  const now = Date.now();
  if (now - lastCleanup < 60_000) return;
  lastCleanup = now;

  try {
    const list = await Filesystem.readdir({ path: CACHE_DIR, directory: Directory.Cache });
    if (!list.files || list.files.length === 0) return;

    const sorted = list.files
      .filter((f: any) => f.name && f.mtime)
      .map((f: any) => ({ name: f.name, mtime: new Date(f.mtime).getTime(), size: f.size || 0 }))
      .sort((a: any, b: any) => a.mtime - b.mtime);

    let totalSize = sorted.reduce((s: number, f: any) => s + f.size, 0);

    for (const file of sorted) {
      if (totalSize <= MAX_CACHE_SIZE) break;
      try {
        await Filesystem.deleteFile({ path: `${CACHE_DIR}/${file.name}`, directory: Directory.Cache });
        totalSize -= file.size;
      } catch { /* пропускаем ошибки */ }
    }
  } catch { /* директория ещё не существует */ }
}
async function downloadAndCache(url: string, path: string): Promise<string | null> {
  const absoluteUrl = mediaUrl(url);
  if (!absoluteUrl) return null;

  try {
    await Filesystem.deleteFile({ path, directory: Directory.Cache }).catch(() => {});

    const result = await Filesystem.downloadFile?.({
      url: absoluteUrl,
      path,
      directory: Directory.Cache,
    });

    if (result?.path) {
      const { uri } = await Filesystem.getUri({ path: result.path, directory: Directory.Cache });
      enforceCacheLimit().catch(() => {});
      return uri;
    }

    // Fallback: fetch + writeFile
    const response = await fetch(absoluteUrl, { cache: 'force-cache' });
    const blob = await response.blob();

    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

    await Filesystem.writeFile({ path, data: base64, directory: Directory.Cache, recursive: true });
    const { uri } = await Filesystem.getUri({ path, directory: Directory.Cache });
    enforceCacheLimit().catch(() => {});
    return uri;
  } catch (e) {
    console.warn('[MediaCache] download error:', e);
    return null;
  }
}

/** Тип медиа для кеширования */
export type MediaCacheType = 'avatar' | 'image' | 'video' | 'file';

/**
 * Возвращает локальный URI для медиа-файла из кеша.
 * Если нет в кеше — скачивает, кеширует и возвращает URI.
 * В браузере — возвращает обычный URL.
 */
export async function getCachedMediaUrl(
  url: string,
  type: MediaCacheType = 'image',
): Promise<string | null> {
  if (!url) return null;
  if (!IS_NATIVE) return mediaUrl(url);

  const prfx = PREFIX[type] || PREFIX.image;
  const path = cachePath(url, prfx);

  try {
    await Filesystem.stat({ path, directory: Directory.Cache });
    const { uri } = await Filesystem.getUri({ path, directory: Directory.Cache });
    return uri;
  } catch {
    return downloadAndCache(url, path);
  }
}

/** Фоновая предзагрузка медиа в кеш */
export function prefetchMedia(url: string, type: MediaCacheType = 'image'): void {
  if (!url || !IS_NATIVE) return;
  getCachedMediaUrl(url, type).catch(() => {});
}

/** Удалить файл из кеша */
export async function removeCachedMedia(url: string, type: MediaCacheType): Promise<void> {
  if (!IS_NATIVE) return;
  const path = cachePath(url, PREFIX[type] || PREFIX.image);
  try { await Filesystem.deleteFile({ path, directory: Directory.Cache }); } catch {}
}

/** Полностью очистить медиа-кеш */
export async function clearMediaCache(): Promise<void> {
  if (!IS_NATIVE) return;
  try { await Filesystem.rmdir({ path: CACHE_DIR, directory: Directory.Cache, recursive: true }); } catch {}
}

/** Примерный размер кеша в байтах */
export async function getMediaCacheSize(): Promise<number> {
  if (!IS_NATIVE) return 0;
  try {
    const list = await Filesystem.readdir({ path: CACHE_DIR, directory: Directory.Cache });
    return (list.files || []).reduce((s: number, f: any) => s + (f.size || 0), 0);
  } catch { return 0; }
}
import { useState, useEffect } from 'react';

/**
 * React-хук для ленивой загрузки кешированного URL медиа-файла.
 * Возвращает:
 *   - cachedUrl: локальный URI (или null пока загружается)
 *   - isLoading: true пока идёт первая загрузка
 *
 * В браузере возвращает обычный URL через mediaUrl.
 */
export function useCachedMediaUrl(
  url: string | null | undefined,
  type: MediaCacheType = 'image',
): { cachedUrl: string | null; isLoading: boolean } {
  const [cachedUrl, setCachedUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!url) {
      setCachedUrl(null);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    getCachedMediaUrl(url, type).then((uri) => {
      if (!cancelled && uri) setCachedUrl(uri);
    }).finally(() => {
      if (!cancelled) setIsLoading(false);
    });

    return () => { cancelled = true; };
  }, [url, type]);

  return { cachedUrl, isLoading };
}
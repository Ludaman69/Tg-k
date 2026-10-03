/**
 * useMediaPrefetch — фоновая предзагрузка медиа при скролле чата.
 *
 * Следит за видимыми сообщениями через виртуализатор и предзагружает
 * фото/видео/аватары из видимых + соседних сообщений в кеш.
 *
 * Работает как в Telegram: превью загружаются ДО того как пользователь
 * до них доскроллит, что даёт мгновенный показ без спиннеров.
 */

import { useEffect, useRef } from 'react';
import type { Virtualizer } from '@tanstack/react-virtual';
import type { RenderMessage } from './messageList';
import { preloadImage } from './imageCache';
import { prefetchMedia } from './mediaCache';
import { mediaPreviewUrl } from './media';

interface UseMediaPrefetchOptions {
  /** Виртуализатор списка сообщений */
  virtualizer: Virtualizer<any, any> | null;
  /** Массив элементов для рендера */
  items: RenderMessage[];
  /** Количество сообщений вперёд/назад от видимых для предзагрузки */
  lookAhead?: number;
  /** Включена ли предзагрузка */
  enabled?: boolean;
}

export function useMediaPrefetch({
  virtualizer,
  items,
  lookAhead = 5,
  enabled = true,
}: UseMediaPrefetchOptions) {
  const prefetchedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!enabled || !virtualizer || items.length === 0) return;

    const range = virtualizer.range;
    if (!range) return;

    const start = Math.max(0, range.startIndex - lookAhead);
    const end = Math.min(items.length - 1, range.endIndex + lookAhead);

    const toPrefetch: Array<{ url: string; type: 'image' | 'video' | 'avatar' }> = [];

    for (let i = start; i <= end; i++) {
      const item = items[i];
      if (!item) continue;

      const media = item.message.media || [];
      const senderAvatar = item.message.sender?.avatar;

      // Аватар отправителя
      if (senderAvatar && !prefetchedRef.current.has(senderAvatar)) {
        toPrefetch.push({ url: senderAvatar, type: 'avatar' });
        prefetchedRef.current.add(senderAvatar);
      }

      // Медиа сообщения
      for (const m of media) {
        const previewUrl = m.thumbnail || m.url;
        if (previewUrl && !prefetchedRef.current.has(previewUrl)) {
          const mediaType = m.type === 'video' ? 'video' as const : 'image' as const;
          toPrefetch.push({ url: previewUrl, type: mediaType });
          prefetchedRef.current.add(previewUrl);
        }
      }
    }

    // Фоновая предзагрузка (fire-and-forget)
    for (const { url, type } of toPrefetch) {
      if (type === 'avatar') {
        prefetchMedia(url, 'avatar');
      } else if (type === 'video') {
        prefetchMedia(url, 'video');
      } else {
        prefetchMedia(url, 'image');
        // Дополнительно для PWA: кешируем через Cache API
        preloadImage(url);
      }
    }

    // Ограничиваем размер Set чтобы не утекала память
    if (prefetchedRef.current.size > 5000) {
      prefetchedRef.current = new Set(
        [...prefetchedRef.current].slice(-2000)
      );
    }
  }, [virtualizer, items, lookAhead, enabled, 
      // Зависимость от range — через виртуализатор, который меняется при скролле
      virtualizer?.range?.startIndex,
      virtualizer?.range?.endIndex]);
}
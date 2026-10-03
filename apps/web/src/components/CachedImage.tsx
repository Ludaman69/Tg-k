/**
 * CachedImage — компонент для отображения изображений с кешированием.
 *
 * На нативе (Capacitor): использует mediaCache.ts для загрузки в Filesystem
 * и отдачи локального URI.
 *
 * В PWA/браузере: использует imageCache.ts для записи в Cache API и
 * Service Worker для отдачи закешированных файлов.
 *
 * Показывает плейсхолдер пока изображение загружается.
 */

import { useState, useEffect, useRef } from 'react';
import { IS_NATIVE } from '../lib/env';
import { useCachedMediaUrl, type MediaCacheType } from '../lib/mediaCache';
import { mediaUrl } from '../lib/media';

interface CachedImageProps {
  url: string | null | undefined;
  type?: MediaCacheType;
  width?: number;
  height?: number;
  alt?: string;
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
  /** Показывать ли плейсхолдер во время загрузки */
  showPlaceholder?: boolean;
  /** Стиль для контейнера */
  containerClassName?: string;
}

export default function CachedImage({
  url,
  type = 'image',
  width,
  height,
  alt = '',
  className = '',
  onClick,
  showPlaceholder = true,
  containerClassName = '',
}: CachedImageProps) {
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const mountedRef = useRef(true);

  // Натив: используем существующий хук useCachedMediaUrl
  const nativeCached = useCachedMediaUrl(url, type);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!url) {
      setImgSrc(null);
      setIsLoading(false);
      return;
    }

    if (IS_NATIVE) {
      // Натив: хук useCachedMediaUrl уже обрабатывает кеширование
      if (nativeCached.cachedUrl) {
        setImgSrc(nativeCached.cachedUrl);
        setIsLoading(false);
        setHasError(false);
      } else if (!nativeCached.isLoading) {
        // Загрузка завершилась но URL нет — ошибка
        setHasError(true);
        setIsLoading(false);
      } else {
        setIsLoading(true);
      }
      return;
    }

    // PWA/браузер: прямой URL, Service Worker сам кеширует (Cache First для /uploads/)
    // Нет нужды в ручном Cache API — SW уже настроен на мгновенную отдачу из кеша.
    let cancelled = false;
    const directUrl = mediaUrl(url!);
    setImgSrc(directUrl);
    setIsLoading(false);
    setHasError(false);

    return () => { cancelled = true; };
  }, [url, type, nativeCached.cachedUrl, nativeCached.isLoading]);

  const aspectStyle = width && height
    ? { aspectRatio: `${width} / ${height}` }
    : undefined;

  if (!url || hasError) {
    return (
      <div
        className={`bg-zinc-800/50 flex items-center justify-center ${containerClassName}`}
        style={aspectStyle}
      >
        <span className="text-zinc-500 text-xs">
          {hasError ? '⚠\u00A0Ошибка загрузки' : ''}
        </span>
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden ${containerClassName}`} style={aspectStyle}>
      {/* Плейсхолдер */}
      {showPlaceholder && isLoading && (
        <div className="absolute inset-0 bg-zinc-800/80 animate-pulse" />
      )}

      {/* Изображение */}
      {imgSrc && (
        <img
          src={imgSrc}
          alt={alt}
          width={width}
          height={height}
          onClick={onClick}
          loading="lazy"
          decoding="async"
          className={`transition-opacity duration-300 ${
            isLoading ? 'opacity-0' : 'opacity-100'
          } ${className}`}
          onLoad={() => { if (mountedRef.current) setIsLoading(false); }}
          onError={() => { if (mountedRef.current) { setHasError(true); setIsLoading(false); } }}
        />
      )}
    </div>
  );
}
import { memo, useMemo, useState, useEffect } from 'react';
import { getInitials, generateAvatarColor } from '../lib/utils';
import { mediaUrl } from '../lib/media';
import { getCachedMediaUrl } from '../lib/mediaCache';

interface AvatarProps {
  src?: string | null;
  name: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  online?: boolean;
}

const sizeClasses = {
  xs: 'w-6 h-6 text-[10px]',
  sm: 'w-8 h-8 text-xs',
  md: 'w-[41px] h-[41px] text-sm',
  lg: 'w-13 h-13 text-base',
  xl: 'w-20 h-20 text-xl',
} as const;

const onlineDotSize = {
  xs: 'w-1.5 h-1.5 border',
  sm: 'w-2 h-2 border',
  md: 'w-2.5 h-2.5 border-2',
  lg: 'w-3 h-3 border-2',
  xl: 'w-4 h-4 border-2',
} as const;

function AvatarInner({ src, name, size = 'md', className = '', online }: AvatarProps) {
  const sizeClass = sizeClasses[size];
  const initials = getInitials(name || '?');
  const gradientClass = generateAvatarColor(name || '');
  // Абсолютный URL — нужен в нативной сборке (Capacitor)
  const resolvedSrc = useMemo(() => mediaUrl(src), [src]);
  // Кешированная версия аватара (загружается асинхронно)
  const [cachedSrc, setCachedSrc] = useState<string | null>(null);

  useEffect(() => {
    if (src) {
      getCachedMediaUrl(src, 'avatar').then((uri) => {
        if (uri) setCachedSrc(uri);
      }).catch(() => {});
    }
  }, [src]);

  return (
    <div className={`relative shrink-0 ${className}`}>
      {resolvedSrc ? (
        <img
          src={cachedSrc || resolvedSrc}
          alt={name}
          className={`${sizeClass} rounded-full object-cover`}
        />
      ) : (
        <div
          className={`${sizeClass} rounded-full bg-gradient-to-br ${gradientClass} flex items-center justify-center text-white font-medium`}
        >
          {initials}
        </div>
      )}
      {online !== undefined && (
        <div
          className={`absolute bottom-0 right-0 ${onlineDotSize[size]} rounded-full border-surface ${
            online ? 'bg-emerald-500' : 'bg-zinc-500'
          }`}
        />
      )}
    </div>
  );
}

const Avatar = memo(AvatarInner);
export default Avatar;

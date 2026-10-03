import { memo } from 'react';

/* ──────────────────────────────────────────────
 * Skeleton — современные скелетоны загрузки
 * Анимация shimmer создаёт эффект бегущего
 * света, как в Telegram, Slack, Discord.
 * ────────────────────────────────────────────── */

interface BlockProps {
  className?: string;
  style?: React.CSSProperties;
}

/** Прямоугольный блок-скелетон со скруглением */
const Block = memo(function Block({ className = '', style }: BlockProps) {
  return (
    <div
      className={`rounded-xl skeleton-shimmer ${className}`}
      style={style}
    />
  );
});

/** Круглый скелетон (аватар) */
const Circle = memo(function Circle({ size = 40, className = '' }: { size?: number; className?: string }) {
  return (
    <div
      className={`rounded-full skeleton-shimmer flex-shrink-0 ${className}`}
      style={{ width: size, height: size }}
    />
  );
});

/** Строка текста-скелетона с кастомной шириной */
const TextLine = memo(function TextLine({
  width = '100%',
  height = 14,
  className = '',
  last = false,
}: {
  width?: string | number;
  height?: number;
  className?: string;
  /** последняя строка — короче на ~40% */
  last?: boolean;
}) {
  const w = last
    ? typeof width === 'string'
      ? `calc(${width} * 0.6)`
      : typeof width === 'number'
        ? width * 0.6
        : '60%'
    : width;
  return (
    <Block
      className={className}
      style={{ width: w, height, borderRadius: 8, minWidth: 20 }}
    />
  );
});

/* ──────────────────────────────────────────────
 * MessageSkeleton — полноценный скелетон сообщения
 * С аватаром, именем, многострочным текстом и
 * временем — выглядит как реальное сообщение.
 * ────────────────────────────────────────────── */

interface MessageSkeletonProps {
  isMine?: boolean;
  index?: number;
}

const MessageSkeleton = memo(function MessageSkeleton({ isMine = false, index = 0 }: MessageSkeletonProps) {
  // Детерминированные вариации на основе индекса
  const nameWidth = `${50 + (index * 11) % 35}%`;
  const lineCount = 2 + (index % 3);
  const lineWidths = [100, 92, 78, 60, 42];

  return (
    <div
      className={`flex items-end gap-3 px-5 py-2 ${isMine ? 'flex-row-reverse' : ''}`}
    >
      {/* Аватар — только для чужих */}
      <Circle size={36} />

      {/* Блок сообщения */}
      <div
        className={`flex flex-col gap-2 max-w-[78%] min-w-[160px] ${
          isMine ? 'items-end' : 'items-start'
        }`}
      >
        {/* Имя отправителя (короткая строка) */}
        <TextLine width={nameWidth} height={11} className="opacity-60" />

        {/* Карточка сообщения со скруглениями как у реальных баблов */}
        <div
          className={`rounded-[22px] px-5 py-3.5 flex flex-col gap-2.5 w-full ${
            isMine
              ? 'bg-zinc-700/25 rounded-br-lg'
              : 'bg-zinc-800/30 rounded-bl-lg'
          }`}
        >
          {Array.from({ length: lineCount }).map((_, i) => (
            <TextLine
              key={i}
              width={`${lineWidths[i % lineWidths.length]}%`}
              height={13}
              last={i === lineCount - 1}
            />
          ))}
        </div>

        {/* Время + галочки прочтения */}
        <div
          className={`flex items-center gap-1.5 px-1.5 ${
            isMine ? 'flex-row-reverse' : ''
          }`}
        >
          <TextLine width={38} height={9} className="opacity-40" />
          {isMine && (
            <div className="flex gap-0.5">
              <TextLine width={16} height={9} className="opacity-30" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

/* ──────────────────────────────────────────────
 * MessageSkeletonGroup — группа скелетонов для
 * стартовой загрузки чата (8 сообщений с датой)
 * ────────────────────────────────────────────── */

const MessageSkeletonGroup = memo(function MessageSkeletonGroup({ count = 8 }: { count?: number }) {
  return (
    <div className="max-w-3xl mx-auto w-full py-2">
      {/* Разделитель даты */}
      <div className="flex justify-center my-4">
        <Block className="h-7 w-28 opacity-30" style={{ borderRadius: 999 }} />
      </div>

      {Array.from({ length: count }).map((_, i) => (
        <MessageSkeleton
          key={i}
          index={i}
          isMine={i % 3 === 2}
        />
      ))}
    </div>
  );
});

/* ──────────────────────────────────────────────
 * ChatSkeleton — элемент списка чатов
 * Аватар + две строки (имя, превью)
 * ────────────────────────────────────────────── */

const ChatSkeleton = memo(function ChatSkeleton() {
  return (
    <div className="flex items-center gap-3.5 px-5 py-3.5">
      <Circle size={52} />
      <div className="flex-1 min-w-0 flex flex-col gap-2.5">
        <div className="flex items-center justify-between">
          <TextLine width="45%" height={15} />
          <TextLine width={30} height={10} className="opacity-40" />
        </div>
        <TextLine width="72%" height={12} className="opacity-50" />
      </div>
    </div>
  );
});

/* ──────────────────────────────────────────────
 * ChatSkeletonGroup — список скелетонов чатов
 * для Sidebar (8 штук)
 * ────────────────────────────────────────────── */

const ChatSkeletonGroup = memo(function ChatSkeletonGroup({ count = 8 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-0.5">
      {Array.from({ length: count }).map((_, i) => (
        <ChatSkeleton key={i} />
      ))}
    </div>
  );
});

/* ──────────────────────────────────────────────
 * CompactSkeleton — компактный индикатор
 * подгрузки старых сообщений (load-more).
 * Три узкие строки, будто «схлопнутые» сообщения.
 * ────────────────────────────────────────────── */

const CompactSkeleton = memo(function CompactSkeleton() {
  return (
    <div className="flex flex-col gap-2.5 px-10 py-2.5">
      <Block className="h-3.5 w-full opacity-25" style={{ borderRadius: 6 }} />
      <Block className="h-3.5 w-[85%] opacity-20" style={{ borderRadius: 6 }} />
      <Block className="h-3.5 w-[55%] opacity-15" style={{ borderRadius: 6 }} />
    </div>
  );
});

export {
  Block,
  Circle,
  TextLine,
  MessageSkeleton,
  MessageSkeletonGroup,
  ChatSkeleton,
  ChatSkeletonGroup,
  CompactSkeleton,
};
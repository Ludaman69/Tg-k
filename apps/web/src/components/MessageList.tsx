import {
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  forwardRef,
} from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { RenderMessage } from '../lib/messageList';
import { useMediaPrefetch } from '../lib/useMediaPrefetch';
import MessageBubble from './MessageBubble';

/**
 * Сколько сообщений держать в DOM за пределами видимой области (сверху и снизу).
 *
 * Небольшой overscan даёт «запас» для быстрого скролла и сохраняет активное
 * воспроизведение медиа при небольших сдвигах, но количество смонтированных
 * пузырей по-прежнему зависит от viewport, а не от длины истории.
 */
const OVERSCAN = 8;

/**
 * Ориентировочная высота ряда до первого измерения.
 *
 * Реальные высоты берутся из `measureElement` (ResizeObserver), поэтому
 * переменная высота (текст / фото / голосовое / реакции) поддерживается.
 */
const ESTIMATED_ROW_HEIGHT = 72;

/**
 * Порог «пользователь внизу» (px) — тот же, что использовался до виртуализации.
 * Экспортируется, чтобы кнопка «вниз» в ChatView и автоскролл здесь
 * принимали решения по одному и тому же правилу.
 */
export const NEAR_BOTTOM_THRESHOLD = 150;

export interface MessageListHandle {
  /** Прокрутка к последнему сообщению. */
  scrollToBottom: (smooth?: boolean) => void;
  /** Прокрутка к конкретному сообщению (поиск, закреплённое, reply). */
  scrollToMessage: (messageId: string) => void;
  /** Находится ли пользователь у нижней границы списка. */
  isNearBottom: () => boolean;
}

interface MessageListProps {
  /** Скролл-контейнер, внутри которого работает виртуализатор. */
  scrollRef: React.RefObject<HTMLDivElement | null>;
  items: RenderMessage[];
  /** messageId → индекс в items (для scrollToIndex). */
  messageIndex: Map<string, number>;
  currentUserId?: string;
  pinnedMessageId: string | null;
  otherMemberName: string;
  otherMemberAvatar?: string | null;
  isGroup: boolean;
  isMobile: boolean;
  selectionMode: boolean;
  selectedMessages: Set<string>;
  onViewProfile: (userId: string) => void;
  onToggleSelect: (messageId: string) => void;
  onStartSelectionMode: (messageId: string) => void;
  /** Вызывается, когда пользователь приблизился к началу истории. */
  onReachTop: () => void;
  /**
   * Отрисован ли слот индикатора подгрузки истории НАД списком.
   *
   * Он сдвигает список внутри скролл-контента, поэтому при его
   * появлении/исчезновении нужно заново измерить scrollMargin.
   */
  topSlotVisible: boolean;
  /**
   * Сообщает наружу подпись даты самой верхней видимой группы —
   * для «плавающего» заголовка даты (FloatingDateHeader).
   *
   * Должен быть стабильным (useCallback), иначе вызовет лишние ререндеры.
   */
  onVisibleDateChange?: (label: string | null) => void;
}

interface VirtualMessageRowProps {
  item: RenderMessage;
  currentUserId?: string;
  pinnedMessageId: string | null;
  otherMemberName: string;
  otherMemberAvatar?: string | null;
  isGroup: boolean;
  isMobile: boolean;
  selectionMode: boolean;
  isSelected: boolean;
  onViewProfile: (userId: string) => void;
  onToggleSelect: (messageId: string) => void;
  onStartSelectionMode: (messageId: string) => void;
}

/**
 * Один ряд виртуального списка: разделитель даты (если нужен) + пузырь.
 *
 * Не обращается к store — получает только готовый render item и стабильные
 * колбэки, поэтому memo действительно отсекает лишние ререндеры.
 */
const VirtualMessageRow = memo(function VirtualMessageRow({
  item,
  currentUserId,
  pinnedMessageId,
  otherMemberName,
  otherMemberAvatar,
  isGroup,
  isMobile,
  selectionMode,
  isSelected,
  onViewProfile,
  onToggleSelect,
  onStartSelectionMode,
}: VirtualMessageRowProps) {
  const { message, showAvatar, isLastInGroup, showDate, dateLabel } = item;

  // Dev-only диагностика: помогает убедиться, что новое сообщение/typing/
  // реакция не перерисовывают все смонтированные ряды.
  // Включается вручную: localStorage.setItem('vortex_debug_rows', '1').
  if (import.meta.env.DEV) {
    try {
      if (localStorage.getItem('vortex_debug_rows') === '1') {
        console.count(`VirtualMessageRow ${message.id}`);
      }
    } catch { /* localStorage может быть недоступен */ }
  }

  return (
    <>
      {showDate && (
        // Отступы заданы padding'ом, а НЕ margin'ом (было `my-1`).
        // `measureElement` виртуализатора измеряет border-box ряда и внешние
        // margin в высоту не включает — из-за этого ряд считался ниже, чем есть,
        // и бейдж даты визуально «съезжал» на соседнее сообщение.
        <div data-label={dateLabel} className="date-separator flex justify-center pt-3 pb-2">
          <span className="px-3 py-1 rounded-full text-[13px] font-medium text-zinc-300 bg-black/40 backdrop-blur-sm">
            {dateLabel}
          </span>
        </div>
      )}
      <div id={`msg-${message.id}`} className="msg-item transition-colors duration-500">
        <MessageBubble
          message={message}
          isMine={message.senderId === currentUserId}
          showAvatar={showAvatar}
          isLastInGroup={isLastInGroup}
          isPinned={message.id === pinnedMessageId}
          otherMemberName={otherMemberName}
          otherMemberAvatar={otherMemberAvatar}
          isGroup={isGroup}
          onViewProfile={onViewProfile}
          selectionMode={selectionMode}
          isSelected={isSelected}
          onToggleSelect={onToggleSelect}
          onStartSelectionMode={onStartSelectionMode}
          isMobile={isMobile}
        />
      </div>
    </>
  );
});

function MessageListInner(
  {
    scrollRef,
    items,
    messageIndex,
    currentUserId,
    pinnedMessageId,
    otherMemberName,
    otherMemberAvatar,
    isGroup,
    isMobile,
    selectionMode,
    selectedMessages,
    onViewProfile,
    onToggleSelect,
    onStartSelectionMode,
    onReachTop,
    topSlotVisible,
    onVisibleDateChange,
  }: MessageListProps,
  ref: React.Ref<MessageListHandle>,
) {
  const count = items.length;

  // Список находится не в самом начале скролл-контента: выше него есть
  // padding-top шапки и слот индикатора подгрузки истории. Без учёта этого
  // смещения виртуализатор считал бы видимый диапазон по «сырому» scrollTop
  // и монтировал не те ряды.
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [scrollMargin, setScrollMargin] = useState(0);

  useLayoutEffect(() => {
    const wrapper = wrapperRef.current;
    const container = scrollRef.current;
    if (!wrapper || !container) return;

    const measure = () => {
      // offsetTop не зависит от текущего scrollTop (в отличие от
      // getBoundingClientRect), поэтому измерение стабильно во время скролла.
      // Скролл-контейнер позиционирован (`relative`), значит он и является
      // offsetParent, и offsetTop = смещение списка внутри скролл-контента.
      const offset = wrapper.offsetTop;
      // Порог отсекает субпиксельные дрожания, иначе получили бы цикл рендеров.
      setScrollMargin((prev) => (Math.abs(prev - offset) > 0.5 ? offset : prev));
    };

    measure();

    // Смещение меняется при изменении padding контейнера (закреплённое
    // сообщение, безопасные зоны, высота композера).
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    observer.observe(wrapper);
    return () => observer.disconnect();
    // topSlotVisible — монтирование/размонтирование слота индикатора подгрузки
    // истории над списком: оно сдвигает список, но размер контейнера не меняет.
  }, [scrollRef, count, topSlotVisible]);

  const virtualizer = useVirtualizer({
    count,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ESTIMATED_ROW_HEIGHT,
    overscan: OVERSCAN,
    scrollMargin,
    // Стабильный ключ по id сообщения: при добавлении старых сообщений
    // в начало массива уже измеренные высоты остаются привязаны к своим
    // сообщениям, а не «съезжают» на соседние индексы.
    getItemKey: (index) => items[index]?.message.id ?? index,
  });

  const virtualItems = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();

  // ── Фоновая предзагрузка медиа (как в Telegram) ──
  useMediaPrefetch({ virtualizer, items, lookAhead: 5, enabled: true });

  const firstId = count > 0 ? items[0].message.id : null;
  const lastId = count > 0 ? items[count - 1].message.id : null;

  // ── Сохранение позиции скролла при добавлении сообщений в начало ──
  // Отслеживаем id первого сообщения: если он изменился, а прежнее первое
  // сообщение всё ещё в списке — значит выполнен prepend старых сообщений,
  // и нужно компенсировать прирост высоты, иначе лента «прыгает».
  const firstIdRef = useRef<string | null>(null);
  const prependAnchorRef = useRef<{ scrollTop: number; scrollHeight: number } | null>(null);

  // Снимок геометрии делаем в render-фазе — до того, как браузер применит
  // новую высоту списка.
  if (firstId !== firstIdRef.current) {
    const container = scrollRef.current;
    const isPrepend =
      firstIdRef.current !== null &&
      firstId !== null &&
      messageIndex.has(firstIdRef.current);

    if (isPrepend && container) {
      prependAnchorRef.current = {
        scrollTop: container.scrollTop,
        scrollHeight: container.scrollHeight,
      };
    }
    firstIdRef.current = firstId;
  }

  useLayoutEffect(() => {
    const anchor = prependAnchorRef.current;
    if (!anchor) return;

    const container = scrollRef.current;
    if (!container) return;

    const delta = container.scrollHeight - anchor.scrollHeight;
    if (delta !== 0) {
      // Смещаем на прирост высоты: пользователь визуально остаётся
      // на том же сообщении.
      container.scrollTop = anchor.scrollTop + delta;
      // Сбрасываем якорь ТОЛЬКО после успешной компенсации.
      // Если delta = 0 (виртуализатор ещё не вставил строки в DOM),
      // якорь остаётся, и следующая итерация useLayoutEffect
      // (при изменении totalSize) применит его снова.
      prependAnchorRef.current = null;
    }
  }, [firstId, totalSize, scrollRef]);

  const isNearBottom = useCallback(() => {
    const container = scrollRef.current;
    if (!container) return true;
    return (
      container.scrollHeight - container.scrollTop - container.clientHeight < NEAR_BOTTOM_THRESHOLD
    );
  }, [scrollRef]);

  const scrollToBottom = useCallback((smooth = true) => {
    const container = scrollRef.current;
    if (!container) return;
    container.scrollTo({ top: container.scrollHeight, behavior: smooth ? 'smooth' : 'instant' });
  }, [scrollRef]);

  const scrollToMessage = useCallback((messageId: string) => {
    const index = messageIndex.get(messageId);
    if (index === undefined) return;
    // Виртуализатор сам домонтирует нужный ряд и доскроллит до него —
    // работает и для сообщений, которых в данный момент нет в DOM.
    virtualizer.scrollToIndex(index, { align: 'center', behavior: 'smooth' });
  }, [messageIndex, virtualizer]);

  useImperativeHandle(ref, () => ({ scrollToBottom, scrollToMessage, isNearBottom }), [
    scrollToBottom,
    scrollToMessage,
    isNearBottom,
  ]);

  // ── Подгрузка старых сообщений ──
  // Триггер основан на диапазоне виртуализатора вместо отдельного
  // IntersectionObserver-сентинела: как только в окне оказывается один из
  // первых рядов, запрашиваем следующую страницу. Повторные/параллельные
  // вызовы отсекает guard в ChatView (loadingMoreMessages / hasMoreMessages).
  const firstVisibleIndex = virtualItems.length > 0 ? virtualItems[0].index : -1;
  useEffect(() => {
    if (count === 0 || firstVisibleIndex < 0) return;
    if (firstVisibleIndex <= OVERSCAN) onReachTop();
  }, [firstVisibleIndex, count, onReachTop]);

  // ── Дата верхнего видимого сообщения (для плавающего заголовка) ──
  //
  // Первый элемент virtualItems — это начало overscan-зоны, которая находится
  // ВЫШЕ вьюпорта. Поэтому ищем первый ряд, который реально пересекает верх
  // видимой области, иначе заголовок показывал бы дату на 8 сообщений раньше.
  const visibleDateLabel = (() => {
    if (count === 0 || virtualItems.length === 0) return null;

    const container = scrollRef.current;
    if (!container) return items[virtualItems[0].index]?.dateLabel ?? null;

    // Верх вьюпорта в системе координат виртуализатора.
    const viewportTop = container.scrollTop + scrollMargin;

    for (const row of virtualItems) {
      if (row.end <= viewportTop) continue; // ряд полностью выше вьюпорта

      const item = items[row.index];
      if (!item) return null;

      // Если у этого ряда есть свой inline-разделитель и он уже целиком во
      // вьюпорте — бейдж даты и так виден в потоке. Показывать поверх него
      // второй, плавающий, не нужно: иначе получилось бы два бейджа.
      if (item.showDate && row.start >= viewportTop) return null;

      return item.dateLabel;
    }
    // Проскроллили ниже всех измеренных рядов — берём последний.
    return items[virtualItems[virtualItems.length - 1].index]?.dateLabel ?? null;
  })();

  // Вызываем только при РЕАЛЬНОЙ смене подписи: виртуализатор ререндерится на
  // каждый кадр скролла, и без этой проверки мы дёргали бы setState в ChatView
  // десятки раз в секунду.
  const lastReportedDateRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (lastReportedDateRef.current === visibleDateLabel) return;
    lastReportedDateRef.current = visibleDateLabel;
    onVisibleDateChange?.(visibleDateLabel);
  }, [visibleDateLabel, onVisibleDateChange]);

  // ── Автоскролл при новом сообщении ──
  // Следим за id ПОСЛЕДНЕГО сообщения, а не за длиной массива: при подгрузке
  // истории длина тоже растёт, и пользователя нельзя отбрасывать вниз.
  const lastIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!lastId) {
      lastIdRef.current = null;
      return;
    }
    if (lastIdRef.current === lastId) return; // хвост не изменился — это prepend

    const isFirstRender = lastIdRef.current === null;
    lastIdRef.current = lastId;
    if (isFirstRender) return; // первичную прокрутку делает ChatView

    const lastItem = items[count - 1];
    const isMine = lastItem.message.senderId === currentUserId;

    // Своё сообщение — всегда вниз. Чужое — только если пользователь у нижней
    // границы; иначе он читает историю и получает кнопку «вниз» с бейджем.
    if (isMine || isNearBottom()) {
      // rAF: ждём, пока виртуализатор смонтирует и измерит новый ряд.
      requestAnimationFrame(() => scrollToBottom(true));
    }
  }, [lastId, count, items, currentUserId, isNearBottom, scrollToBottom]);

  return (
    <div
      ref={wrapperRef}
      className="relative w-full max-w-3xl mx-auto"
      style={{ height: totalSize }}
    >
      {virtualItems.map((virtualRow) => {
        const item = items[virtualRow.index];
        if (!item) return null;

        return (
          <div
            key={virtualRow.key}
            // measureElement снимает реальную высоту ряда (ResizeObserver),
            // поэтому фиксированная высота не нужна: текст, картинки,
            // голосовые, видео и реакции могут иметь любой размер.
            ref={virtualizer.measureElement}
            data-index={virtualRow.index}
            // virtual-row (flow-root) не даёт margin'ам пузыря «вытекать»
            // за пределы ряда — иначе измеренная высота была бы меньше
            // фактической и содержимое рядов смещалось.
            className="virtual-row absolute left-0 w-full"
            // start отсчитывается от начала скролл-контента, поэтому вычитаем
            // scrollMargin, чтобы получить позицию внутри самого списка.
            style={{ transform: `translateY(${virtualRow.start - scrollMargin}px)` }}
          >
            <VirtualMessageRow
              item={item}
              currentUserId={currentUserId}
              pinnedMessageId={pinnedMessageId}
              otherMemberName={otherMemberName}
              otherMemberAvatar={otherMemberAvatar}
              isGroup={isGroup}
              isMobile={isMobile}
              selectionMode={selectionMode}
              isSelected={selectedMessages.has(item.message.id)}
              onViewProfile={onViewProfile}
              onToggleSelect={onToggleSelect}
              onStartSelectionMode={onStartSelectionMode}
            />
          </div>
        );
      })}
    </div>
  );
}

const MessageList = memo(forwardRef<MessageListHandle, MessageListProps>(MessageListInner));

export default MessageList;

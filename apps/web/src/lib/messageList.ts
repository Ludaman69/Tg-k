import type { Message } from './types';

/**
 * Готовая к отрисовке строка виртуального списка сообщений.
 *
 * Вся метаинформация (группировка, даты, аватары) считается ОДИН раз при
 * изменении массива сообщений. Раньше на каждый ряд выполнялись
 * `chatMessages.find()` + `chatMessages.indexOf()`, что давало O(n²) на рендер
 * списка и заметно тормозило уже на 50–100 сообщениях.
 */
export interface RenderMessage {
  /** Оригинальный объект сообщения — ссылка НЕ клонируется, чтобы memo работал. */
  message: Message;
  /** Первое сообщение в группе от одного отправителя → показываем имя. */
  showAvatar: boolean;
  /** Последнее сообщение в группе → «хвостик» пузыря и аватар. */
  isLastInGroup: boolean;
  /** Нужно ли отрисовать разделитель даты перед этим сообщением. */
  showDate: boolean;
  /** Готовая подпись даты (локализованная, посчитана заранее). */
  dateLabel: string;
}

/** Ключ строки для виртуализатора — стабилен между рендерами. */
export function renderMessageKey(item: RenderMessage): string {
  return item.message.id;
}

/**
 * Преобразует массив сообщений в массив готовых render-items.
 *
 * Один линейный проход: O(n) вместо прежней связки
 * `messageMeta` → `groupedMessages` → `find` → `indexOf`.
 * Разделитель даты — часть render item (вариант B из требований), поэтому
 * виртуализатор измеряет ряд вместе с его датой и высоты остаются корректными.
 */
export function buildRenderMessages(messages: Message[], lang: string): RenderMessage[] {
  const locale = lang === 'ru' ? 'ru-RU' : 'en-US';
  // Один Intl-форматтер на весь список вместо `toLocaleDateString` на сообщение.
  const dateFormatter = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long' });

  const items: RenderMessage[] = [];
  // Кеш «подписи по дню»: подряд идущие сообщения одного дня форматируются один раз.
  const labelCache = new Map<string, string>();

  let prevDayKey: string | null = null;
  let prevSenderId: string | null = null;

  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    const date = new Date(message.createdAt);
    // Ключ дня без аллокации строк локали: год-месяц-день.
    const dayKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

    let dateLabel = labelCache.get(dayKey);
    if (dateLabel === undefined) {
      dateLabel = dateFormatter.format(date);
      labelCache.set(dayKey, dateLabel);
    }

    const showDate = prevDayKey === null || prevDayKey !== dayKey;
    const showAvatar = showDate || prevSenderId !== message.senderId;

    // Последнее в группе определяем «постфактум»: когда узнаём следующий элемент.
    if (items.length > 0) {
      const previous = items[items.length - 1];
      previous.isLastInGroup = showDate || previous.message.senderId !== message.senderId;
    }

    items.push({
      message,
      showAvatar,
      isLastInGroup: true, // уточнится на следующей итерации либо останется true для последнего
      showDate,
      dateLabel,
    });

    prevDayKey = dayKey;
    prevSenderId = message.senderId;
  }

  return items;
}

/**
 * Индекс `messageId → позиция в renderItems`.
 *
 * Нужен для `scrollToIndex` (поиск, переход к закреплённому сообщению) и для
 * пересылки выбранных сообщений — вместо `chatMessages.find(...)`.
 */
export function buildMessageIndex(items: RenderMessage[]): Map<string, number> {
  const index = new Map<string, number>();
  for (let i = 0; i < items.length; i++) {
    index.set(items[i].message.id, i);
  }
  return index;
}

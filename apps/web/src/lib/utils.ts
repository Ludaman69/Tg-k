import { clsx, type ClassValue } from 'clsx';

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function formatTime(date: string | Date, lang: string = 'ru'): string {
  const d = new Date(date);
  return d.toLocaleTimeString(lang === 'ru' ? 'ru-RU' : 'en-US', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Telegram-style date formatting for the chat list.
 *
 * Rules (same as Telegram):
 *   - Today         → "14:30" (time only)
 *   - Yesterday     → "вчера" / "yesterday"
 *   - 2–6 days ago  → "пн", "вт", … / "Mon", "Tue", …
 *   - This year     → "1 сент." / "Sep 1"
 *   - Older years   → "01.09.2023" / "9/1/2023"
 */
export function formatChatTime(date: string | Date, lang: string = 'ru'): string {
  const d = new Date(date);
  const now = new Date();

  // Normalise to date-only for day-diff calculation
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.floor((today.getTime() - target.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    // Today → time only
    return d.toLocaleTimeString(lang === 'ru' ? 'ru-RU' : 'en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  if (diffDays === 1) {
    // Yesterday
    return lang === 'ru' ? 'вчера' : 'yesterday';
  }

  if (diffDays < 7) {
    // Short weekday name
    if (lang === 'ru') {
      return ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'][d.getDay()];
    }
    return d.toLocaleDateString('en-US', { weekday: 'short' });
  }

  if (d.getFullYear() === now.getFullYear()) {
    // Same year → "1 сент." / "Sep 1"
    if (lang === 'ru') {
      const months = [
        'янв.', 'февр.', 'мар.', 'апр.', 'мая', 'июн.',
        'июл.', 'авг.', 'сент.', 'окт.', 'нояб.', 'дек.',
      ];
      return `${d.getDate()} ${months[d.getMonth()]}`;
    }
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  // Previous year(s) → "01.09.23" / "9/1/23"
  return d.toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-US', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  });
}

export function formatDate(date: string | Date, lang: string = 'ru'): string {
  const d = new Date(date);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) return lang === 'ru' ? 'Сегодня' : 'Today';
  if (days === 1) return lang === 'ru' ? 'Вчера' : 'Yesterday';
  if (days < 7) {
    const weekDaysRu = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];
    const weekDaysEn = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return (lang === 'ru' ? weekDaysRu : weekDaysEn)[d.getDay()];
  }

  return d.toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-US', {
    day: 'numeric',
    month: 'long',
    year: days > 365 ? 'numeric' : undefined,
  });
}

export function formatLastSeen(date: string | Date, lang: string = 'ru'): string {
  const d = new Date(date);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const minutes = Math.floor(diff / (1000 * 60));

  if (minutes < 1) return lang === 'ru' ? 'только что' : 'just now';
  if (minutes < 60) return lang === 'ru' ? `${minutes} мин. назад` : `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return lang === 'ru' ? `${hours} ч. назад` : `${hours}h ago`;

  const at = lang === 'ru' ? ' в ' : ' at ';
  return formatDate(date, lang) + at + formatTime(date, lang);
}

/**
 * Strips markdown syntax (**bold**, *italic*, _italic_, ~strikethrough~, `code`)
 * and returns plain text for use in previews.
 */
export function stripMarkdown(text: string): string {
  if (!text) return text;
  return text
    .replace(/\*\*([\s\S]*?)\*\*/g, '$1')
    .replace(/\*([\s\S]*?)\*/g, '$1')
    .replace(/_([\s\S]*?)_/g, '$1')
    .replace(/~([\s\S]*?)~/g, '$1')
    .replace(/`([\s\S]*?)`/g, '$1');
}

/**
 * Длина последнего «графемного кластера» строки в code units.
 *
 * Нужна для корректного backspace в поле ввода: эмодзи вроде 👨‍👩‍👧‍👦 или 👍🏽
 * состоят из нескольких code point (ZWJ, модификаторы тона, VS16),
 * и удалять их нужно целиком, а не по одному символу.
 *
 * Использует Intl.Segmenter, а при его отсутствии (старые Android WebView) —
 * ручной разбор ZWJ-последовательностей и модификаторов.
 */
export function lastGraphemeLength(text: string): number {
  if (!text) return 0;

  if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
    const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
    let length = 0;
    for (const { segment } of segmenter.segment(text)) {
      length = segment.length;
    }
    return length || 1;
  }

  // Fallback: собираем кластер с конца строки
  const ZWJ = 0x200d;
  const VS16 = 0xfe0f;
  const KEYCAP = 0x20e3;
  const isSkinTone = (cp: number) => cp >= 0x1f3fb && cp <= 0x1f3ff;
  const isRegional = (cp: number) => cp >= 0x1f1e6 && cp <= 0x1f1ff;

  const codePoints = Array.from(text);
  let taken = 1;

  while (taken < codePoints.length) {
    const current = codePoints[codePoints.length - taken].codePointAt(0) ?? 0;
    const previous = codePoints[codePoints.length - taken - 1].codePointAt(0) ?? 0;

    const joins =
      current === ZWJ ||
      current === VS16 ||
      current === KEYCAP ||
      isSkinTone(current) ||
      previous === ZWJ ||
      (isRegional(current) && isRegional(previous));

    if (!joins) break;
    taken++;
  }

  return codePoints.slice(codePoints.length - taken).join('').length;
}

export function getInitials(name: string): string {
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function generateAvatarColor(name: string): string {
  const colors = [
    'from-violet-500 to-purple-600',
    'from-blue-500 to-indigo-600',
    'from-emerald-500 to-teal-600',
    'from-rose-500 to-pink-600',
    'from-amber-500 to-orange-600',
    'from-cyan-500 to-blue-600',
    'from-fuchsia-500 to-purple-600',
    'from-lime-500 to-green-600',
  ];

  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }

  return colors[Math.abs(hash) % colors.length];
}

// Логика waveform вынесена в ./waveform — там есть LRU-кеш, дедупликация
// одновременных запросов и лимит параллельных decode-операций.
// Основной путь: готовый `MediaItem.waveform` с сервера (без decodeAudioData).
export {
  extractWaveform,
  normalizeWaveform,
  getCachedWaveform,
  flatWaveform,
  waveformFromMedia,
  WAVEFORM_BARS,
} from './waveform';

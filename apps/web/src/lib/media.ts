import { API_ORIGIN } from './env';

/**
 * Превращает путь к медиафайлу в абсолютный URL, пригодный
 * и для браузера (PWA), и для нативной оболочки (Capacitor).
 *
 * Сервер возвращает относительные пути ('/uploads/avatars/abc.jpg').
 * В браузере они и так корректны, а в WebView указывали бы внутрь APK,
 * поэтому к ним добавляется API_ORIGIN.
 *
 * Абсолютные (http/https), data: и blob: URL возвращаются без изменений.
 */
export function mediaUrl(path: string): string;
export function mediaUrl(path: string | null | undefined): string | null;
export function mediaUrl(path: string | null | undefined): string | null {
  if (!path) return null;

  // Уже абсолютный адрес или локальный объект — не трогаем
  if (
    path.startsWith('http://') ||
    path.startsWith('https://') ||
    path.startsWith('data:') ||
    path.startsWith('blob:') ||
    path.startsWith('capacitor://')
  ) {
    return path;
  }

  if (!API_ORIGIN) return path;

  return `${API_ORIGIN}${path.startsWith('/') ? '' : '/'}${path}`;
}

/**
 * URL для показа изображения/видео ВНУТРИ пузыря сообщения.
 *
 * Отдаёт серверное превью (`media.thumbnail`), если оно есть, и только при его
 * отсутствии — оригинал. Без этого браузер декодировал полноразмерный файл
 * (например 4000×3000 JPEG) для каждой картинки в истории, что и вызывало
 * скачки памяти и фризы при скролле.
 *
 * Оригинал должен запрашиваться отдельно — в lightbox (см. `mediaOriginalUrl`).
 */
export function mediaPreviewUrl(media: {
  url: string;
  thumbnail?: string | null;
}): string {
  return mediaUrl(media.thumbnail || media.url);
}

/** URL оригинального файла — только для lightbox/полноэкранного просмотра. */
export function mediaOriginalUrl(media: { url: string }): string {
  return mediaUrl(media.url);
}

/** Максимальная сторона генерируемого превью (px). */
const THUMBNAIL_MAX_SIZE = 720;

/** Качество JPEG-превью. */
const THUMBNAIL_QUALITY = 0.72;

export interface ImageThumbnail {
  /** Файл превью для отдельной загрузки на сервер. */
  file: File;
  /** Размеры ОРИГИНАЛА — нужны для aspect-ratio в пузыре. */
  width: number;
  height: number;
}

/**
 * Готовит уменьшенную копию изображения перед отправкой.
 *
 * Считается один раз у отправителя, поэтому получатели видят лёгкое превью
 * вместо многомегабайтного оригинала. Если что-то не поддерживается
 * (нет canvas, нестандартный формат) — возвращает null, и отправка идёт
 * прежним путём с оригиналом.
 */
export async function createImageThumbnail(file: File): Promise<ImageThumbnail | null> {
  if (typeof document === 'undefined' || !file.type.startsWith('image/')) return null;
  // GIF нельзя ресайзить без потери анимации.
  if (file.type === 'image/gif') return null;

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('image decode failed'));
      img.src = objectUrl;
    });

    const width = image.naturalWidth;
    const height = image.naturalHeight;
    if (!width || !height) return null;

    const scale = Math.min(1, THUMBNAIL_MAX_SIZE / Math.max(width, height));
    // Картинка и так небольшая — превью не нужно, но размеры отдаём.
    if (scale >= 1) return { file, width, height };

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', THUMBNAIL_QUALITY);
    });
    if (!blob) return null;

    const thumbFile = new File([blob], `thumb_${Date.now()}.jpg`, { type: 'image/jpeg' });
    return { file: thumbFile, width, height };
  } catch {
    return null;
  } finally {
    // Обязательный revoke — иначе blob остаётся в памяти на весь сеанс.
    URL.revokeObjectURL(objectUrl);
  }
}

/**
 * Подбирает поддерживаемый mimeType для записи аудио.
 *
 * ogg/opus — приоритет (лучшее сжатие), webm/opus — Chrome/Android,
 * mp4/aac — единственный вариант в iOS Safari и части WebView.
 */
export function pickAudioMimeType(): { mimeType: string; ext: string } {
  const candidates: Array<{ mimeType: string; ext: string }> = [
    { mimeType: 'audio/ogg;codecs=opus', ext: 'ogg' },
    { mimeType: 'audio/webm;codecs=opus', ext: 'webm' },
    { mimeType: 'audio/webm', ext: 'webm' },
    { mimeType: 'audio/mp4;codecs=mp4a.40.2', ext: 'm4a' },
    { mimeType: 'audio/mp4', ext: 'm4a' },
  ];

  for (const c of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c.mimeType)) {
      return c;
    }
  }

  // Пустой mimeType — браузер выберет формат по умолчанию
  return { mimeType: '', ext: 'webm' };
}

/**
 * Подбирает поддерживаемый mimeType для записи видео (видеокружки).
 */
export function pickVideoMimeType(): { mimeType: string; ext: string } {
  const candidates: Array<{ mimeType: string; ext: string }> = [
    { mimeType: 'video/webm;codecs=vp8,opus', ext: 'webm' },
    { mimeType: 'video/webm;codecs=vp9,opus', ext: 'webm' },
    { mimeType: 'video/webm', ext: 'webm' },
    { mimeType: 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', ext: 'mp4' },
    { mimeType: 'video/mp4', ext: 'mp4' },
  ];

  for (const c of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c.mimeType)) {
      return c;
    }
  }

  return { mimeType: '', ext: 'webm' };
}

/**
 * Формирует имя файла для скачивания из URL медиафайла.
 */
export function fileNameFromUrl(url: string, fallback = 'file'): string {
  try {
    const clean = url.split('?')[0].split('#')[0];
    const name = clean.substring(clean.lastIndexOf('/') + 1);
    return name || fallback;
  } catch {
    return fallback;
  }
}

/**
 * Бэкофилл превью (`Media.thumbnail`) и размеров (`width`/`height`)
 * для изображений, загруженных ДО появления клиентской генерации превью.
 *
 * Зачем: `mediaPreviewUrl()` отдаёт оригинал, если у media нет thumbnail.
 * Для старых 3–4 МБ JPEG это значит полное декодирование в пузыре сообщения —
 * ровно та причина скачков памяти, от которой избавлялись на новых сообщениях.
 *
 * Параметры превью совпадают с клиентскими (apps/web/src/lib/media.ts):
 * максимальная сторона 720 px, JPEG quality 72.
 *
 * Скрипт учитывает шифрование файлов (AES-256-GCM): оригинал при
 * необходимости расшифровывается в память, а новое превью шифруется тем же
 * ключом, чтобы раздача через /uploads работала одинаково.
 *
 * Запуск:
 *   npm run db:backfill-thumbnails -w apps/server            # применить
 *   npm run db:backfill-thumbnails -w apps/server -- --dry-run
 *   npm run db:backfill-thumbnails -w apps/server -- --limit 50
 *
 * Безопасно перезапускать: обрабатываются только записи без thumbnail
 * или без width/height.
 */
import '../src/config'; // грузит .env и инициализирует шифрование
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../src/db';
import {
  isEncryptionEnabled,
  decryptFileToBuffer,
  encryptFileInPlace,
} from '../src/encrypt';
import { UPLOADS_ROOT } from '../src/shared';

/** Должно совпадать с THUMBNAIL_MAX_SIZE в apps/web/src/lib/media.ts. */
const THUMBNAIL_MAX_SIZE = 720;

/** Должно совпадать с THUMBNAIL_QUALITY (0.72) в apps/web/src/lib/media.ts. */
const THUMBNAIL_QUALITY = 72;

interface Args {
  dryRun: boolean;
  limit?: number;
}

function parseArgs(argv: string[]): Args {
  const dryRun = argv.includes('--dry-run');
  const limitIdx = argv.indexOf('--limit');
  const raw =
    limitIdx !== -1 && argv[limitIdx + 1] ? Number(argv[limitIdx + 1]) : undefined;
  return { dryRun, limit: Number.isFinite(raw) ? raw : undefined };
}

/** Абсолютный путь к файлу в uploads с защитой от path traversal. */
function resolveUpload(urlPath: string): string | null {
  if (!urlPath || urlPath.includes('..')) return null;
  const rel = urlPath.replace(/^\/uploads\//, '');
  const full = path.resolve(UPLOADS_ROOT, rel);
  if (!full.startsWith(UPLOADS_ROOT)) return null;
  return full;
}

/**
 * Читает файл из uploads в «чистом» виде.
 * Сначала пробует расшифровать (новые файлы), иначе читает как есть (legacy).
 */
function readUploadPlain(filePath: string): Buffer | null {
  if (!fs.existsSync(filePath)) return null;
  if (isEncryptionEnabled()) {
    const decrypted = decryptFileToBuffer(filePath);
    if (decrypted) return decrypted;
  }
  try {
    return fs.readFileSync(filePath);
  } catch {
    return null;
  }
}

/**
 * Проверяет magic bytes растрового изображения.
 *
 * Нужна, потому что в uploads встречаются файлы, зашифрованные прежним
 * ENCRYPTION_KEY: они не расшифровываются, и их содержимое — просто шум.
 * Без этой проверки sharp кидал бы «unsupported image format» со стектрейсом
 * на каждый такой файл и прятал реальные ошибки.
 */
function looksLikeImage(buf: Buffer): boolean {
  if (buf.length < 12) return false;

  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return true;
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (buf.subarray(0, 8).toString('hex') === '89504e470d0a1a0a') return true;
  // GIF87a / GIF89a
  if (buf.subarray(0, 3).toString('ascii') === 'GIF') return true;
  // WebP: 'RIFF' .... 'WEBP'
  if (
    buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buf.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return true;
  }
  // AVIF/HEIC: ISO-BMFF box 'ftyp'
  if (buf.subarray(4, 8).toString('ascii') === 'ftyp') return true;
  // BMP
  if (buf.subarray(0, 2).toString('ascii') === 'BM') return true;
  // TIFF (little/big endian)
  const tiff = buf.subarray(0, 4).toString('hex');
  if (tiff === '49492a00' || tiff === '4d4d002a') return true;

  return false;
}

interface ThumbResult {
  /** URL превью, или null — если оригинал и так маленький / анимированный. */
  thumbnailUrl: string | null;
  width: number;
  height: number;
}

async function buildThumbnail(
  original: Buffer,
  dryRun: boolean,
): Promise<ThumbResult | null> {
  const meta = await sharp(original).metadata();
  // При EXIF-повороте на 90/270° местами меняются стороны — учитываем,
  // иначе aspect-ratio в пузыре будет перевёрнутым.
  const swapSides = meta.orientation !== undefined && meta.orientation >= 5;
  const rawWidth = meta.width ?? 0;
  const rawHeight = meta.height ?? 0;
  const width = swapSides ? rawHeight : rawWidth;
  const height = swapSides ? rawWidth : rawHeight;
  if (!width || !height) return null;

  // Анимированные форматы не ресайзим — потеряем анимацию (как и на клиенте).
  const isAnimated = (meta.pages ?? 1) > 1 || meta.format === 'gif';
  const needsResize = Math.max(width, height) > THUMBNAIL_MAX_SIZE;

  if (isAnimated || !needsResize) {
    // Превью не нужно, но размеры всё равно полезны: с ними пузырь
    // резервирует место заранее и лента не «прыгает» при загрузке.
    return { thumbnailUrl: null, width, height };
  }

  if (dryRun) {
    return { thumbnailUrl: '(dry-run)', width, height };
  }

  const thumbBuffer = await sharp(original)
    .rotate() // применяем EXIF-ориентацию, иначе превью «ляжет» на бок
    .resize({
      width: THUMBNAIL_MAX_SIZE,
      height: THUMBNAIL_MAX_SIZE,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({ quality: THUMBNAIL_QUALITY, mozjpeg: true })
    .toBuffer();

  // Имя как у обычных загрузок: UUID + расширение.
  const filename = `${uuidv4()}.jpg`;
  const filePath = path.join(UPLOADS_ROOT, filename);
  fs.writeFileSync(filePath, thumbBuffer);

  // Раздача /uploads расшифровывает файлы на лету, поэтому новое превью
  // должно быть зашифровано так же, как обычные загрузки.
  if (isEncryptionEnabled()) {
    encryptFileInPlace(filePath);
  }

  return { thumbnailUrl: `/uploads/${filename}`, width, height };
}

async function main() {
  const { dryRun, limit } = parseArgs(process.argv.slice(2));

  console.log(
    `🖼  Бэкофилл превью${dryRun ? ' (DRY-RUN — ничего не пишем)' : ''}` +
      `${limit ? `, лимит ${limit}` : ''}`,
  );
  console.log(
    `   Шифрование файлов: ${isEncryptionEnabled() ? 'включено' : 'выключено'}\n`,
  );

  const candidates = await prisma.media.findMany({
    where: {
      type: 'image',
      OR: [{ thumbnail: null }, { width: null }, { height: null }],
    },
    select: { id: true, url: true, thumbnail: true },
    orderBy: { id: 'asc' },
    ...(limit ? { take: limit } : {}),
  });

  console.log(`📋 Кандидатов: ${candidates.length}`);
  if (candidates.length === 0) {
    console.log('✅ Нечего обрабатывать — все изображения уже с метаданными.');
    return;
  }

  let withThumb = 0;
  let dimensionsOnly = 0;
  let missing = 0;
  let unreadable = 0;
  let failed = 0;

  for (const media of candidates) {
    const filePath = resolveUpload(media.url);
    if (!filePath) {
      console.warn(`  ⚠ Небезопасный путь, пропуск: ${media.url}`);
      failed++;
      continue;
    }

    const original = readUploadPlain(filePath);
    if (!original) {
      console.warn(`  ⚠ Файл недоступен: ${media.url}`);
      missing++;
      continue;
    }

    // Не изображение после расшифровки — файл зашифрован другим ключом
    // или тип media в БД не соответствует содержимому (например APK).
    // Оригинал остаётся в раздаче как есть, превью построить нельзя.
    if (!looksLikeImage(original)) {
      unreadable++;
      continue;
    }

    try {
      const result = await buildThumbnail(original, dryRun);
      if (!result) {
        console.warn(`  ⚠ Не удалось прочитать размеры: ${media.url}`);
        failed++;
        continue;
      }

      const data: { thumbnail?: string; width: number; height: number } = {
        width: result.width,
        height: result.height,
      };
      // Существующий thumbnail не перезатираем — бэкофилл идемпотентен.
      if (result.thumbnailUrl && !dryRun && !media.thumbnail) {
        data.thumbnail = result.thumbnailUrl;
      }

      if (!dryRun) {
        await prisma.media.update({ where: { id: media.id }, data });
      }

      if (result.thumbnailUrl) withThumb++;
      else dimensionsOnly++;

      process.stdout.write(
        `  ✔ превью: ${withThumb}, только размеры: ${dimensionsOnly}\r`,
      );
    } catch (e) {
      console.error(`\n  ❌ Ошибка обработки ${media.url}:`, e);
      failed++;
    }
  }

  console.log('\n');
  console.log(`✅ Превью создано:        ${withThumb}`);
  console.log(`ℹ  Только width/height:  ${dimensionsOnly} (файл небольшой или анимация)`);
  console.log(`⏭  Не читается как img:  ${unreadable} (старый ключ шифрования / не картинка)`);
  console.log(`⚠  Файл не найден:       ${missing}`);
  console.log(`❌ Ошибок:               ${failed}`);

  if (dryRun) {
    console.log('\nDRY-RUN: изменения не применялись. Уберите --dry-run для записи.');
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error('Ошибка:', e);
    await prisma.$disconnect();
    process.exit(1);
  });

/**
 * Диагностика метаданных медиа: сколько записей уже умеет рисоваться «дешёво»
 * (thumbnail + width/height для картинок, waveform для голосовых), а сколько
 * идёт по fallback-пути.
 *
 * Запуск: npm run db:media-stats -w apps/server
 */
import { prisma } from '../src/db';

async function main() {
  const rows = await prisma.$queryRaw<
    Array<{
      type: string;
      total: number;
      no_thumbnail: number;
      no_dimensions: number;
      no_waveform: number;
    }>
  >`
    SELECT
      type,
      count(*)::int                                                              AS total,
      count(*) FILTER (WHERE thumbnail IS NULL)::int                             AS no_thumbnail,
      count(*) FILTER (WHERE width IS NULL OR height IS NULL)::int               AS no_dimensions,
      count(*) FILTER (WHERE waveform IS NULL OR cardinality(waveform) = 0)::int AS no_waveform
    FROM "Media"
    GROUP BY type
    ORDER BY total DESC
  `;

  if (rows.length === 0) {
    console.log('В таблице Media нет записей.');
    return;
  }

  console.table(rows);

  const images = rows.filter((r) => r.type === 'image' || r.type === 'video');
  const voices = rows.filter((r) => r.type === 'voice' || r.type === 'audio');

  const imgFallback = images.reduce((sum, r) => sum + r.no_thumbnail, 0);
  const voiceFallback = voices.reduce((sum, r) => sum + r.no_waveform, 0);

  console.log(
    `\nИзображений/видео без превью (показываются оригиналом): ${imgFallback}`,
  );
  console.log(
    `Голосовых без готового waveform (fallback decode на клиенте): ${voiceFallback}`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });

/**
 * Проверяет, что все записанные `Media.thumbnail` действительно существуют
 * на диске, расшифровываются текущим ключом и читаются как изображения.
 *
 * Запуск: npm run db:verify-thumbnails -w apps/server
 */
import '../src/config';
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';
import { prisma } from '../src/db';
import { isEncryptionEnabled, decryptFileToBuffer } from '../src/encrypt';
import { UPLOADS_ROOT } from '../src/shared';

async function main() {
  const rows = await prisma.media.findMany({
    where: { thumbnail: { not: null } },
    select: { id: true, url: true, thumbnail: true, width: true, height: true },
  });

  console.log(`🔍 Проверяем ${rows.length} превью\n`);

  let ok = 0;
  const problems: string[] = [];

  for (const row of rows) {
    const rel = (row.thumbnail as string).replace(/^\/uploads\//, '');
    const filePath = path.resolve(UPLOADS_ROOT, rel);

    if (!filePath.startsWith(UPLOADS_ROOT) || !fs.existsSync(filePath)) {
      problems.push(`${row.thumbnail} — файл отсутствует`);
      continue;
    }

    // Раздача /uploads сначала пробует расшифровать, поэтому проверяем так же.
    const plain = isEncryptionEnabled() ? decryptFileToBuffer(filePath) : null;
    const buffer = plain ?? fs.readFileSync(filePath);

    try {
      const meta = await sharp(buffer).metadata();
      if (!meta.width || !meta.height) {
        problems.push(`${row.thumbnail} — не удалось прочитать размеры`);
        continue;
      }
      if (Math.max(meta.width, meta.height) > 720) {
        problems.push(
          `${row.thumbnail} — превью больше 720px (${meta.width}×${meta.height})`,
        );
        continue;
      }
      if (!row.width || !row.height) {
        problems.push(`${row.thumbnail} — в БД нет width/height оригинала`);
        continue;
      }

      const savedBytes = fs.statSync(filePath).size;
      ok++;
      if (ok <= 5) {
        console.log(
          `  ✔ ${meta.format} ${meta.width}×${meta.height}, ${Math.round(savedBytes / 1024)} КБ ` +
            `(оригинал ${row.width}×${row.height})`,
        );
      }
    } catch (e) {
      problems.push(`${row.thumbnail} — sharp не смог прочитать: ${String(e)}`);
    }
  }

  console.log(`\n✅ Корректных превью: ${ok}/${rows.length}`);
  if (problems.length > 0) {
    console.log(`❌ Проблем: ${problems.length}`);
    for (const p of problems) console.log(`   - ${p}`);
    process.exitCode = 1;
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });

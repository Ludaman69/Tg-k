/**
 * Smoke-проверка схемы Media после `npm run db:push`.
 *
 * Убеждается, что колонка `waveform` (Float[]) реально существует в базе и
 * принимает массив чисел: без неё сервер падал бы на первой же вставке media.
 *
 * Запуск: npm run db:check-waveform -w apps/server
 */
import { prisma } from '../src/db';

/** Маркер намеренного откатa транзакции (не ошибка). */
class Rollback extends Error {}

async function main() {
  // 1. Колонка есть в information_schema и имеет нужный тип?
  const columns = await prisma.$queryRaw<
    Array<{ column_name: string; data_type: string; udt_name: string }>
  >`
    SELECT column_name, data_type, udt_name
    FROM information_schema.columns
    WHERE table_name = 'Media' AND column_name = 'waveform'
  `;

  if (columns.length === 0) {
    console.error('✖ Колонка "Media"."waveform" НЕ найдена — выполните npm run db:push');
    process.exit(1);
  }

  const col = columns[0];
  // Для Float[] Postgres отдаёт data_type = ARRAY, udt_name = _float8
  console.log(`✔ Колонка waveform: data_type=${col.data_type}, udt_name=${col.udt_name}`);
  if (col.udt_name !== '_float8') {
    console.error(`✖ Ожидался тип _float8 (double precision[]), получен ${col.udt_name}`);
    process.exit(1);
  }

  // 2. Prisma Client действительно умеет писать/читать waveform.
  //    Пишем во временное сообщение и сразу откатываем транзакцию,
  //    чтобы не оставлять мусор в реальных чатах.
  const chat = await prisma.chat.findFirst({ select: { id: true } });
  const user = await prisma.user.findFirst({ select: { id: true } });

  if (!chat || !user) {
    console.log('ℹ Нет чатов/пользователей для write-теста — проверена только схема.');
    return;
  }

  const probe = [0, 0.25, 0.5, 0.75, 1];
  try {
    await prisma.$transaction(async (tx) => {
      const message = await tx.message.create({
        data: {
          chatId: chat.id,
          senderId: user.id,
          content: '__waveform_probe__',
          type: 'voice',
          media: {
            create: {
              type: 'voice',
              url: '/uploads/__waveform_probe__.webm',
              duration: 1,
              waveform: probe,
            },
          },
        },
        include: { media: true },
      });

      const saved = message.media[0]?.waveform ?? [];
      const ok =
        saved.length === probe.length && saved.every((v, i) => Math.abs(v - probe[i]) < 1e-9);

      if (!ok) {
        throw new Error(`waveform round-trip failed: ${JSON.stringify(saved)}`);
      }

      console.log(`✔ Prisma insert/read waveform: [${saved.join(', ')}]`);

      // Откат: тестовое сообщение не должно попасть в историю чата.
      throw new Rollback();
    });
  } catch (e) {
    if (!(e instanceof Rollback)) throw e;
    console.log('✔ Тестовая запись откачена — база чистая.');
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error('✖ Проверка не пройдена:', e);
    await prisma.$disconnect();
    process.exit(1);
  });

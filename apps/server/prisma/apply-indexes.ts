/**
 * Применяет индексы производительности для истории сообщений.
 *
 * ЗАЧЕМ: запрос истории чата выполняется как
 *     SELECT ... FROM "Message"
 *     WHERE "chatId" = $1 AND "isDeleted" = false AND "createdAt" < $2
 *     ORDER BY "createdAt" DESC LIMIT 50
 * Без индексов PostgreSQL делает Seq Scan по всей таблице Message и сортирует
 * весь чат на каждую страницу — именно из-за этого подгрузка сообщений при
 * скролле работает «очень долго». То же относится к связанным таблицам
 * (media/reactions/readBy), которые Prisma догружает через WHERE messageId IN (...).
 *
 * Индексы создаются с CONCURRENTLY — без блокировки записи, поэтому скрипт
 * безопасно запускать на работающем сервере. Операции идемпотентны
 * (IF NOT EXISTS), повторный запуск ничего не сломает.
 *
 * Запуск: npm run db:indexes   (или npx tsx prisma/apply-indexes.ts)
 */

import { PrismaClient } from '@prisma/client';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const prisma = new PrismaClient();

/** Индексы: [описание, SQL]. CONCURRENTLY нельзя выполнять в транзакции. */
const INDEXES: Array<[string, string]> = [
  [
    'Message(chatId, createdAt) — пагинация истории чата',
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "Message_chatId_createdAt_idx" ON "Message" ("chatId", "createdAt")',
  ],
  [
    'Message(chatId, isDeleted, createdAt) — история с фильтром удалённых',
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "Message_chatId_isDeleted_createdAt_idx" ON "Message" ("chatId", "isDeleted", "createdAt")',
  ],
  [
    'Message(senderId)',
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "Message_senderId_idx" ON "Message" ("senderId")',
  ],
  [
    'Message(replyToId) — подгрузка replyTo',
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "Message_replyToId_idx" ON "Message" ("replyToId")',
  ],
  [
    'Media(messageId) — вложения сообщений',
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "Media_messageId_idx" ON "Media" ("messageId")',
  ],
  [
    'Reaction(messageId) — реакции',
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "Reaction_messageId_idx" ON "Reaction" ("messageId")',
  ],
  [
    'ReadReceipt(messageId) — статусы прочтения',
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "ReadReceipt_messageId_idx" ON "ReadReceipt" ("messageId")',
  ],
  [
    'HiddenMessage(userId) — фильтр скрытых сообщений',
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "HiddenMessage_userId_idx" ON "HiddenMessage" ("userId")',
  ],
  [
    'ChatMember(userId) — список чатов пользователя',
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "ChatMember_userId_idx" ON "ChatMember" ("userId")',
  ],
];

/** Таблицы, для которых обновляем статистику планировщика. */
const ANALYZE_TABLES = ['Message', 'Media', 'Reaction', 'ReadReceipt', 'HiddenMessage', 'ChatMember'];

/**
 * Извлекает человекочитаемую причину из ошибки Prisma.
 * У P2010 текст СУБД лежит в meta.message, а сам e.message — многострочная
 * обёртка, первая строка которой пустая.
 */
function describeError(e: unknown): { text: string; pgCode?: string } {
  if (e && typeof e === 'object') {
    const meta = (e as { meta?: { message?: string; code?: string } }).meta;
    if (meta?.message) {
      return { text: meta.message.trim(), pgCode: meta.code };
    }
    const msg = (e as { message?: string }).message;
    if (typeof msg === 'string') {
      const firstMeaningful = msg.split('\n').map((l) => l.trim()).find((l) => l.length > 0);
      if (firstMeaningful) return { text: firstMeaningful };
    }
  }
  return { text: String(e) };
}

async function applyIndexes() {
  console.log('🚀 Применение индексов производительности...\n');

  let created = 0;
  let failed = 0;
  let permissionDenied = false;

  for (const [description, sql] of INDEXES) {
    const started = Date.now();
    try {
      await prisma.$executeRawUnsafe(sql);
      const ms = Date.now() - started;
      console.log(`  ✅ ${description} (${ms} ms)`);
      created++;
    } catch (e) {
      const { text, pgCode } = describeError(e);
      // 42501 = insufficient_privilege (нужно быть владельцем таблицы)
      if (pgCode === '42501') permissionDenied = true;
      console.error(`  ❌ ${description}\n     ${text}`);
      failed++;
    }
  }

  console.log('\n📊 Обновление статистики планировщика (ANALYZE)...');
  for (const table of ANALYZE_TABLES) {
    try {
      await prisma.$executeRawUnsafe(`ANALYZE "${table}"`);
    } catch (e) {
      console.error(`  ⚠️  ANALYZE "${table}": ${describeError(e).text}`);
    }
  }

  console.log('\n┌──────────────────────────────────────┐');
  console.log(`│  Создано / уже было: ${String(created).padStart(2)} из ${String(INDEXES.length).padStart(2)}          │`);
  if (failed > 0) {
    console.log(`│  Ошибок:             ${String(failed).padStart(2)}                  │`);
  }
  console.log('└──────────────────────────────────────┘');

  if (failed > 0) {
    if (permissionDenied) {
      const dbUser = (() => {
        try {
          return new URL(process.env.DATABASE_URL ?? '').username || 'пользователь БД';
        } catch {
          return 'пользователь БД';
        }
      })();
      console.log(`\n⚠️  Недостаточно прав: "${dbUser}" не владелец таблиц (PostgreSQL 42501).`);
      console.log('   Вариант 1 — передать владение приложению и повторить запуск:');
      console.log(`     psql -U postgres -d vortex -v owner=${dbUser} -f prisma/fix-table-owner.sql`);
      console.log('     (на Linux: sudo -u postgres psql -d vortex -f prisma/fix-table-owner.sql)');
      console.log('   Вариант 2 — применить SQL под владельцем/суперпользователем:');
      console.log('     psql "$DATABASE_URL" -f prisma/add-performance-indexes.sql');
    } else {
      console.log('\n⚠️  Часть индексов не создана. Применить SQL можно вручную:');
      console.log('     psql "$DATABASE_URL" -f prisma/add-performance-indexes.sql');
    }
    process.exit(1);
  }

  console.log('\n✅ Готово. Загрузка сообщений при скролле должна заметно ускориться.');
}

applyIndexes()
  .catch((e) => {
    console.error('❌ Ошибка применения индексов:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

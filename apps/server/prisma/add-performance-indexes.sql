-- ─────────────────────────────────────────────────────────────────────────────
-- Индексы производительности для истории сообщений.
--
-- ЗАЧЕМ: запрос истории чата выполняется как
--     SELECT ... FROM "Message"
--     WHERE "chatId" = $1 AND "isDeleted" = false AND "createdAt" < $2
--     ORDER BY "createdAt" DESC LIMIT 50
-- Без индекса PostgreSQL делает Seq Scan по всей таблице Message и сортировку
-- всего чата на каждую страницу — именно это и делает подгрузку при скролле
-- «очень долгой». То же самое касается подзапросов на media/reactions/readBy,
-- которые Prisma выполняет отдельными запросами вида WHERE "messageId" IN (...).
--
-- CONCURRENTLY — построение индекса без блокировки записи в таблицу,
-- поэтому скрипт безопасно запускать на работающем сервере.
-- ВАЖНО: CREATE INDEX CONCURRENTLY нельзя выполнять внутри транзакции,
-- поэтому запускайте файл без обёртки BEGIN/COMMIT.
--
-- ЗАПУСК (под владельцем таблиц, обычно postgres):
--
--     psql -U postgres -d vortex -f prisma/add-performance-indexes.sql
--
-- Если пользователь из DATABASE_URL (напр. vortex) не владелец таблиц,
-- `npm run db:indexes` и `prisma db push` упадут с ошибкой 42501
-- («нужно быть владельцем таблицы»). Тогда либо примените этот файл под
-- postgres, либо один раз передайте владение приложению готовым скриптом
-- (меняет владельца всех таблиц/последовательностей схемы public):
--
--     psql -U postgres -d vortex -f prisma/fix-table-owner.sql
--
-- Скрипт идемпотентен (IF NOT EXISTS) — повторный запуск безопасен.
-- ─────────────────────────────────────────────────────────────────────────────

-- Основная пагинация истории чата
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Message_chatId_createdAt_idx"
  ON "Message" ("chatId", "createdAt");

-- Тот же запрос с фильтром isDeleted (используется в /messages/chat/:chatId)
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Message_chatId_isDeleted_createdAt_idx"
  ON "Message" ("chatId", "isDeleted", "createdAt");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "Message_senderId_idx"
  ON "Message" ("senderId");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "Message_replyToId_idx"
  ON "Message" ("replyToId");

-- Связанные сущности, подтягиваемые через MESSAGE_INCLUDE.
-- Без этих индексов каждый батч сообщений вызывает Seq Scan по таблицам.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Media_messageId_idx"
  ON "Media" ("messageId");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "Reaction_messageId_idx"
  ON "Reaction" ("messageId");

CREATE INDEX CONCURRENTLY IF NOT EXISTS "ReadReceipt_messageId_idx"
  ON "ReadReceipt" ("messageId");

-- Фильтр hiddenBy: { none: { userId } } в запросе истории
CREATE INDEX CONCURRENTLY IF NOT EXISTS "HiddenMessage_userId_idx"
  ON "HiddenMessage" ("userId");

-- Загрузка списка чатов пользователя
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ChatMember_userId_idx"
  ON "ChatMember" ("userId");

-- Обновляем статистику планировщика, чтобы новые индексы начали применяться сразу
ANALYZE "Message";
ANALYZE "Media";
ANALYZE "Reaction";
ANALYZE "ReadReceipt";
ANALYZE "HiddenMessage";
ANALYZE "ChatMember";

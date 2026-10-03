-- ─────────────────────────────────────────────────────────────────────────────
-- Передаёт владение объектами схемы public роли приложения (из DATABASE_URL).
--
-- ЗАЧЕМ: если таблицы создавались под postgres (например, через
-- `sudo -u postgres psql`, ручной дамп или `createdb` без -O), то пользователь
-- приложения (vortex) может только читать/писать данные, но не менять схему.
-- Тогда `prisma db push` и `npm run db:indexes` падают с ошибкой PostgreSQL
-- 42501:
--
--     ОШИБКА: нужно быть владельцем таблицы ChatMember
--     sql_schema_connector::apply_migration::migration_step
--       with step=CreateIndex { ... }
--
-- Владелец таблицы нужен для CREATE INDEX / ALTER TABLE / DROP, поэтому
-- GRANT ALL PRIVILEGES проблему не решает — нужно именно сменить владельца.
--
-- ЗАПУСК (под владельцем таблиц, обычно postgres):
--
--   Linux:
--     sudo -u postgres psql -d vortex -f prisma/fix-table-owner.sql
--   Windows:
--     psql -U postgres -d vortex -f prisma/fix-table-owner.sql
--
-- Другое имя роли передаётся переменной owner:
--     psql -U postgres -d vortex -v owner=myapp -f prisma/fix-table-owner.sql
--
-- Скрипт идемпотентен — повторный запуск безопасен.
-- ─────────────────────────────────────────────────────────────────────────────

-- Роль приложения: по умолчанию vortex (совпадает с deploy.sh)
\if :{?owner}
\else
  \set owner vortex
\endif

-- psql не подставляет :переменные внутри $$...$$, поэтому передаём значение
-- в DO-блок через параметр сессии.
SET vortex.owner = :'owner';

DO $$
DECLARE
  target_role text := current_setting('vortex.owner');
  r           record;
  changed     int := 0;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = target_role) THEN
    RAISE EXCEPTION 'Роль "%" не существует. Создайте её: CREATE ROLE % WITH LOGIN PASSWORD ''...'';',
      target_role, target_role;
  END IF;

  -- Таблицы (включая партиции)
  FOR r IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')
      AND pg_get_userbyid(c.relowner) <> target_role
  LOOP
    EXECUTE format('ALTER TABLE public.%I OWNER TO %I', r.relname, target_role);
    changed := changed + 1;
  END LOOP;

  -- Последовательности (autoincrement/serial)
  FOR r IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'S'
      AND pg_get_userbyid(c.relowner) <> target_role
  LOOP
    EXECUTE format('ALTER SEQUENCE public.%I OWNER TO %I', r.relname, target_role);
    changed := changed + 1;
  END LOOP;

  -- Представления
  FOR r IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'v'
      AND pg_get_userbyid(c.relowner) <> target_role
  LOOP
    EXECUTE format('ALTER VIEW public.%I OWNER TO %I', r.relname, target_role);
    changed := changed + 1;
  END LOOP;

  -- Пользовательские типы (enum и т. п.)
  FOR r IN
    SELECT t.typname
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typtype IN ('e', 'd')
      AND pg_get_userbyid(t.typowner) <> target_role
  LOOP
    EXECUTE format('ALTER TYPE public.%I OWNER TO %I', r.typname, target_role);
    changed := changed + 1;
  END LOOP;

  RAISE NOTICE 'Владелец изменён у % объект(ов) схемы public → %', changed, target_role;
END
$$;

-- Владение самой схемой: нужно, чтобы Prisma могла создавать новые таблицы
ALTER SCHEMA public OWNER TO :"owner";
GRANT ALL ON SCHEMA public TO :"owner";

-- Проверка результата: все строки должны содержать роль приложения
SELECT tablename, tableowner
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

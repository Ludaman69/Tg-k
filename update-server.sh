#!/bin/bash
# ══════════════════════════════════════════════
#   VORTEX — Обновление на сервере
# ══════════════════════════════════════════════

set -e

APP_DIR="/var/www/vortex"
ARCHIVE="/root/vortex-deploy.tar.gz"
ENV_BACKUP="/root/vortex-env-backup"

GREEN='\033[0;32m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

print_step() { echo -e "\n${CYAN}━━━ $1 ━━━${NC}\n"; }
print_ok() { echo -e "${GREEN}  ✓ $1${NC}"; }
print_err() { echo -e "${RED}  ✗ $1${NC}"; }

echo ""
echo "══════════════════════════════════════════════"
echo "  VORTEX — Обновление сервера"
echo "══════════════════════════════════════════════"
echo ""

# Проверка архива
if [ ! -f "$ARCHIVE" ]; then
    print_err "Архив $ARCHIVE не найден!"
    echo "  Сначала запустите update-local.bat на вашем ПК"
    exit 1
fi

# 1. Остановка сервера
print_step "1/7 — Остановка сервера"
pm2 stop vortex-server 2>/dev/null || true
print_ok "Сервер остановлен"

# 2. Бэкап .env
print_step "2/7 — Сохранение .env"
if [ -f "$APP_DIR/apps/server/.env" ]; then
    cp "$APP_DIR/apps/server/.env" "$ENV_BACKUP"
    print_ok ".env сохранён в $ENV_BACKUP"
else
    print_err ".env не найден — пропускаем"
fi

# 3. Бэкап uploads
print_step "3/7 — Сохранение загруженных файлов"
if [ -d "$APP_DIR/apps/server/uploads/avatars" ]; then
    cp -r "$APP_DIR/apps/server/uploads/avatars" /root/vortex-avatars-backup 2>/dev/null || true
    print_ok "Аватарки сохранены"
fi

# 4. Распаковка
print_step "4/7 — Распаковка обновления"
tar -xzf "$ARCHIVE" -C "$APP_DIR"
print_ok "Файлы обновлены"

# Восстановление .env
if [ -f "$ENV_BACKUP" ]; then
    cp "$ENV_BACKUP" "$APP_DIR/apps/server/.env"
    print_ok ".env восстановлен"
fi

# Восстановление аватарок
if [ -d "/root/vortex-avatars-backup" ]; then
    mkdir -p "$APP_DIR/apps/server/uploads/avatars"
    cp -r /root/vortex-avatars-backup/* "$APP_DIR/apps/server/uploads/avatars/" 2>/dev/null || true
    rm -rf /root/vortex-avatars-backup
    print_ok "Аватарки восстановлены"
fi

# 5. Установка зависимостей
print_step "5/7 — Установка зависимостей"
cd "$APP_DIR"
npm install --production=false --legacy-peer-deps
print_ok "Зависимости установлены"

# 6. Сборка
print_step "6/7 — Сборка проекта"

cd "$APP_DIR/apps/server"
npx prisma generate
print_ok "Prisma Client сгенерирован"

# Без владения таблицами prisma db push падает с ошибкой 42501
# («нужно быть владельцем таблицы ChatMember»)
if [ -f "prisma/fix-table-owner.sql" ] && command -v psql >/dev/null 2>&1; then
    sudo -u postgres psql -q -d vortex -f prisma/fix-table-owner.sql >/dev/null 2>&1 \
        && print_ok "Владелец объектов БД — vortex" \
        || print_err "Не удалось передать владение объектами БД — пропускаем"
fi

npx prisma db push --accept-data-loss
print_ok "База данных синхронизирована"

npx tsc
print_ok "Сервер скомпилирован"

cd "$APP_DIR/apps/web"
npx vite build
print_ok "Фронтенд собран"

# 7. Запуск
print_step "7/7 — Запуск сервера"
pm2 restart vortex-server
pm2 save
print_ok "Сервер запущен"

# Очистка
rm -f "$ARCHIVE"

echo ""
echo "══════════════════════════════════════════════"
echo -e "  ${GREEN}✓ ОБНОВЛЕНИЕ ЗАВЕРШЕНО!${NC}"
echo ""
echo "  Проверьте: pm2 logs vortex-server --lines 10"
echo "══════════════════════════════════════════════"
echo ""

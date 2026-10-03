#!/bin/bash
# ═══════════════════════════════════════════════════════════════
#  Vortex Messenger — полный деплой на чистый VPS
# ═══════════════════════════════════════════════════════════════
#
#  Требования:
#    - Чистый VPS с Ubuntu 22.04 или 24.04
#    - Домен с A-записью, направленной на IP сервера
#
#  Инструкция:
#    1. Загрузите весь проект на сервер:
#       scp -r ./* root@<IP>:/var/www/vortex/
#    2. Зайдите на сервер:  ssh root@<IP>
#    3. Запустите:
#       chmod +x /var/www/vortex/deploy.sh
#       /var/www/vortex/deploy.sh
#
# ═══════════════════════════════════════════════════════════════

set -e

# ─── Цвета ───
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

print_step() { echo -e "\n${CYAN}━━━ $1 ━━━${NC}\n"; }
print_ok()   { echo -e "${GREEN}✅ $1${NC}"; }
print_warn() { echo -e "${YELLOW}⚠️  $1${NC}"; }
print_error(){ echo -e "${RED}❌ $1${NC}"; }

# ─── Проверки ───
if [ "$EUID" -ne 0 ]; then
  print_error "Запустите с правами root: sudo ./deploy.sh"
  exit 1
fi

APP_DIR="/var/www/vortex"

if [ ! -f "$APP_DIR/package.json" ]; then
  print_error "Файлы проекта не найдены в $APP_DIR!"
  echo ""
  echo "Сначала загрузите проект на сервер:"
  echo "  scp -r ./* root@<IP>:$APP_DIR/"
  exit 1
fi

# ─── Ввод параметров ───
echo -e "${CYAN}"
echo "╔═══════════════════════════════════════════════════╗"
echo "║        🌀 Vortex Messenger — Деплой              ║"
echo "╚═══════════════════════════════════════════════════╝"
echo -e "${NC}"

read -p "Введите домен (например messenger.ru): " DOMAIN
if [ -z "$DOMAIN" ]; then
  print_error "Домен не указан!"
  exit 1
fi

read -p "Введите email для SSL-сертификата: " SSL_EMAIL
if [ -z "$SSL_EMAIL" ]; then
  print_error "Email не указан!"
  exit 1
fi

# Генерация безопасных ключей
DB_PASSWORD=$(openssl rand -base64 24 | tr -dc 'a-zA-Z0-9' | head -c 32)
JWT_SECRET=$(openssl rand -base64 48 | tr -dc 'a-zA-Z0-9' | head -c 64)
ENCRYPTION_KEY=$(openssl rand -hex 32)
TURN_SECRET=$(openssl rand -base64 24 | tr -dc 'a-zA-Z0-9' | head -c 32)

echo ""
print_ok "Параметры приняты. Начинаю установку..."
echo ""

# ═══════════════════════════════════════
# Шаг 1: Обновление системы
# ═══════════════════════════════════════
print_step "1/10 — Обновление системы"
export DEBIAN_FRONTEND=noninteractive
apt update && apt upgrade -y
apt install -y curl wget gnupg2 software-properties-common git unzip build-essential
print_ok "Система обновлена"

# ═══════════════════════════════════════
# Шаг 2: Node.js 20
# ═══════════════════════════════════════
print_step "2/10 — Установка Node.js 20"
if ! command -v node &>/dev/null || [[ $(node -v | cut -d. -f1 | tr -d v) -lt 20 ]]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt install -y nodejs
fi
npm install -g pm2
print_ok "Node.js $(node -v), npm $(npm -v), PM2 установлен"

# ═══════════════════════════════════════
# Шаг 3: PostgreSQL
# ═══════════════════════════════════════
print_step "3/10 — Установка PostgreSQL"
apt install -y postgresql postgresql-contrib
systemctl enable postgresql
systemctl start postgresql

sudo -u postgres psql -c "DO \$\$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'vortex') THEN
    CREATE ROLE vortex WITH LOGIN PASSWORD '${DB_PASSWORD}';
  END IF;
END \$\$;"
sudo -u postgres psql -c "SELECT 1 FROM pg_database WHERE datname = 'vortex'" | grep -q 1 || \
  sudo -u postgres createdb -O vortex vortex

# Если БД уже существовала и её таблицы создавались под postgres, то
# `prisma db push` упадёт с «нужно быть владельцем таблицы ChatMember» (42501).
# Передаём владение схемой и всеми объектами роли vortex.
if [ -f "${APP_DIR}/apps/server/prisma/fix-table-owner.sql" ]; then
  sudo -u postgres psql -q -d vortex -f "${APP_DIR}/apps/server/prisma/fix-table-owner.sql" >/dev/null 2>&1 \
    && print_ok "Владелец объектов БД — vortex" \
    || print_warn "Не удалось передать владение объектами БД (проверьте вручную: prisma/fix-table-owner.sql)"
fi

print_ok "PostgreSQL готов (БД: vortex, пользователь: vortex)"

# ═══════════════════════════════════════
# Шаг 4: Nginx
# ═══════════════════════════════════════
print_step "4/10 — Установка Nginx"
apt install -y nginx
systemctl enable nginx
print_ok "Nginx установлен"

# ═══════════════════════════════════════
# Шаг 5: Certbot (SSL)
# ═══════════════════════════════════════
print_step "5/10 — Установка Certbot"
apt install -y certbot python3-certbot-nginx
print_ok "Certbot установлен"

# ═══════════════════════════════════════
# Шаг 6: coturn (TURN-сервер для звонков)
# ═══════════════════════════════════════
print_step "6/10 — Установка coturn (TURN)"
apt install -y coturn

cat > /etc/turnserver.conf << EOF
listening-port=3478
tls-listening-port=5349
realm=${DOMAIN}
server-name=${DOMAIN}
lt-cred-mech
use-auth-secret
static-auth-secret=${TURN_SECRET}
fingerprint
no-cli
no-tlsv1
no-tlsv1_1
EOF

sed -i 's/#TURNSERVER_ENABLED=1/TURNSERVER_ENABLED=1/' /etc/default/coturn 2>/dev/null || true
systemctl enable coturn
systemctl restart coturn
print_ok "coturn настроен"

# ═══════════════════════════════════════
# Шаг 7: Настройка окружения (.env)
# ═══════════════════════════════════════
print_step "7/10 — Создание .env"

mkdir -p ${APP_DIR}/apps/server/uploads/avatars

cat > ${APP_DIR}/apps/server/.env << EOF
DATABASE_URL=postgresql://vortex:${DB_PASSWORD}@localhost:5432/vortex
JWT_SECRET=${JWT_SECRET}
ENCRYPTION_KEY=${ENCRYPTION_KEY}
PORT=3001
NODE_ENV=production
CORS_ORIGINS=https://${DOMAIN}
MAX_REGISTRATIONS_PER_IP=5
TURN_URL=turn:${DOMAIN}:3478
TURN_SECRET=${TURN_SECRET}
STUN_URLS=stun:stun.l.google.com:19302,stun:${DOMAIN}:3478
EOF

print_ok "Файл .env создан"

# ═══════════════════════════════════════
# Шаг 8: Установка зависимостей и сборка
# ═══════════════════════════════════════
print_step "8/10 — Установка зависимостей и сборка"

cd ${APP_DIR}

# Установка зависимостей (npm workspaces)
npm install --legacy-peer-deps
print_ok "Зависимости установлены"

# --- Бэкенд ---
cd ${APP_DIR}/apps/server
npx prisma generate
npx prisma db push --accept-data-loss
print_ok "БД синхронизирована"

npx tsc
print_ok "Бэкенд скомпилирован (dist/)"

# --- Фронтенд ---
cd ${APP_DIR}/apps/web
npx vite build
print_ok "Фронтенд собран (dist/)"

# ═══════════════════════════════════════
# Шаг 9: Nginx конфигурация
# ═══════════════════════════════════════
print_step "9/10 — Настройка Nginx"

cat > /etc/nginx/sites-available/vortex << EOF
server {
    listen 80;
    server_name ${DOMAIN};

    root ${APP_DIR}/apps/web/dist;
    index index.html;
    client_max_body_size 50M;

    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml text/javascript;
    gzip_min_length 1000;

    location / {
        try_files \$uri \$uri/ /index.html;

        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff2?)$ {
            expires 30d;
            add_header Cache-Control "public, immutable";
        }
    }

    location /api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        client_max_body_size 50M;
    }

    location /socket.io/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_read_timeout 86400;
    }

    location /uploads/ {
        proxy_pass http://127.0.0.1:3001/uploads/;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
    }

    # Раздача APK мобильного приложения (без Google Play).
    # Отдаём напрямую с диска — минуя Node, чтобы не грузить приложение.
    location /downloads/ {
        alias ${APP_DIR}/apps/server/downloads/;

        # Только APK-файлы
        location ~* \.apk\$ {
            default_type application/vnd.android.package-archive;
            add_header Content-Disposition "attachment";
            add_header Accept-Ranges bytes;
            expires 1d;
        }

        # Остальное (в т.ч. version.json) — недоступно напрямую
        location ~ ^/downloads/(?!.*\.apk\$) {
            return 404;
        }
    }
}
EOF

# Блокировка доступа по голому IP
cat > /etc/nginx/sites-available/block-ip << EOF
server {
    listen 80 default_server;
    server_name _;
    return 444;
}
EOF

ln -sf /etc/nginx/sites-available/vortex /etc/nginx/sites-enabled/
ln -sf /etc/nginx/sites-available/block-ip /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

nginx -t && systemctl reload nginx
print_ok "Nginx настроен"

# --- SSL ---
print_step "Получение SSL-сертификата"
certbot --nginx -d ${DOMAIN} --non-interactive --agree-tos -m ${SSL_EMAIL} 2>&1 || {
  print_warn "SSL не удалось получить автоматически."
  print_warn "Проверьте что DNS A-запись ${DOMAIN} указывает на IP этого сервера."
  print_warn "После настройки DNS выполните вручную:"
  echo "  certbot --nginx -d ${DOMAIN}"
}

# Обновить block-ip для HTTPS тоже
if [ -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ]; then
  cat > /etc/nginx/sites-available/block-ip << EOF
server {
    listen 80 default_server;
    listen 443 ssl default_server;
    server_name _;
    ssl_certificate /etc/letsencrypt/live/${DOMAIN}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${DOMAIN}/privkey.pem;
    return 444;
}
EOF
  nginx -t && systemctl reload nginx
  print_ok "Доступ по IP заблокирован (HTTP и HTTPS)"
fi

# ═══════════════════════════════════════
# Шаг 10: Запуск через PM2
# ═══════════════════════════════════════
print_step "10/10 — Запуск сервера"

cd ${APP_DIR}/apps/server

pm2 delete vortex-server 2>/dev/null || true
pm2 start dist/index.js --name vortex-server --cwd ${APP_DIR}/apps/server
pm2 save
pm2 startup systemd -u root --hp /root 2>/dev/null || pm2 startup

print_ok "Сервер запущен"

# ═══════════════════════════════════════
# Файрвол
# ═══════════════════════════════════════
if command -v ufw &>/dev/null; then
  ufw allow 22/tcp
  ufw allow 80/tcp
  ufw allow 443/tcp
  ufw allow 3478/tcp
  ufw allow 3478/udp
  ufw --force enable
  print_ok "Файрвол настроен"
fi

# ═══════════════════════════════════════
# Скрипт обновления (для будущих апдейтов)
# ═══════════════════════════════════════
cat > ${APP_DIR}/update.sh << 'UPDATESCRIPT'
#!/bin/bash
set -e
APP_DIR="/var/www/vortex"
ARCHIVE="/root/vortex-deploy.tar.gz"
ENV_BACKUP="/root/vortex-env-backup"

echo ""
echo "VORTEX - Update server"
echo ""

if [ ! -f "$ARCHIVE" ]; then
    echo "Архив не найден: $ARCHIVE"; exit 1
fi

echo "1/7 Остановка сервера"
pm2 stop vortex-server 2>/dev/null || true

echo "2/7 Бэкап .env"
if [ -f "$APP_DIR/apps/server/.env" ]; then
    cp "$APP_DIR/apps/server/.env" "$ENV_BACKUP"
fi

echo "3/7 Бэкап аватаров"
if [ -d "$APP_DIR/apps/server/uploads/avatars" ]; then
    cp -r "$APP_DIR/apps/server/uploads/avatars" /root/vortex-avatars-backup 2>/dev/null || true
fi

echo "4/7 Распаковка обновления"
tar -xzf "$ARCHIVE" -C "$APP_DIR"
if [ -f "$ENV_BACKUP" ]; then
    cp "$ENV_BACKUP" "$APP_DIR/apps/server/.env"
fi
if [ -d "/root/vortex-avatars-backup" ]; then
    mkdir -p "$APP_DIR/apps/server/uploads/avatars"
    cp -r /root/vortex-avatars-backup/* "$APP_DIR/apps/server/uploads/avatars/" 2>/dev/null || true
    rm -rf /root/vortex-avatars-backup
fi

echo "5/7 Установка зависимостей"
cd "$APP_DIR"
npm install --legacy-peer-deps

echo "6/7 Сборка сервера"
cd "$APP_DIR/apps/server"
npx prisma generate
# Владение таблицами: иначе db push падает с ошибкой 42501
if [ -f "prisma/fix-table-owner.sql" ]; then
    sudo -u postgres psql -q -d vortex -f prisma/fix-table-owner.sql >/dev/null 2>&1 || true
fi
npx prisma db push --accept-data-loss
npx tsc

echo "7/7 Запуск сервера"
pm2 restart vortex-server
pm2 save
rm -f "$ARCHIVE"
echo ""
echo "Готово! Проверка: pm2 logs vortex-server --lines 10"
UPDATESCRIPT
chmod +x ${APP_DIR}/update.sh

# ═══════════════════════════════════════
# Итог
# ═══════════════════════════════════════
SERVER_IP=$(curl -s4 ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')

echo ""
echo -e "${GREEN}╔═══════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║       🎉 Vortex Messenger развёрнут!             ║${NC}"
echo -e "${GREEN}╠═══════════════════════════════════════════════════╣${NC}"
echo -e "${GREEN}║${NC}                                                   ${GREEN}║${NC}"
echo -e "${GREEN}║${NC}  🌐 Сайт:   https://${DOMAIN}${NC}"
echo -e "${GREEN}║${NC}  📡 IP:     ${SERVER_IP}${NC}"
echo -e "${GREEN}║${NC}                                                   ${GREEN}║${NC}"
echo -e "${GREEN}║${NC}  📂 Проект:  ${APP_DIR}${NC}"
echo -e "${GREEN}║${NC}  🔧 Env:     ${APP_DIR}/apps/server/.env${NC}"
echo -e "${GREEN}║${NC}  🔄 Апдейт:  ${APP_DIR}/update.sh${NC}"
echo -e "${GREEN}║${NC}                                                   ${GREEN}║${NC}"
echo -e "${GREEN}╠═══════════════════════════════════════════════════╣${NC}"
echo -e "${GREEN}║${NC}  Команды:                                        ${GREEN}║${NC}"
echo -e "${GREEN}║${NC}    pm2 logs vortex-server    — логи              ${GREEN}║${NC}"
echo -e "${GREEN}║${NC}    pm2 restart vortex-server — перезапуск        ${GREEN}║${NC}"
echo -e "${GREEN}║${NC}    pm2 monit                 — мониторинг        ${GREEN}║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════════╝${NC}"

# Сохранить credentials
cat > ${APP_DIR}/CREDENTIALS.txt << EOF
=== Vortex Messenger — Credentials ===
Дата: $(date)
Домен: ${DOMAIN}
IP: ${SERVER_IP}

--- База данных ---
Host: localhost:5432
Database: vortex
User: vortex
Password: ${DB_PASSWORD}

--- Приложение ---
JWT_SECRET=${JWT_SECRET}
ENCRYPTION_KEY=${ENCRYPTION_KEY}

--- TURN сервер ---
TURN_URL=turn:${DOMAIN}:3478
TURN_SECRET=${TURN_SECRET}
EOF

chmod 600 ${APP_DIR}/CREDENTIALS.txt
echo ""
print_ok "Credentials сохранены в ${APP_DIR}/CREDENTIALS.txt"
echo ""

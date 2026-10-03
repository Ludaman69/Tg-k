# Vortex Messenger — Руководство по развёртыванию

## Что понадобится

| Что | Детали |
|-----|--------|
| **VPS** | Ubuntu 22.04 / 24.04, от 1 ГБ RAM, публичный IP |
| **Домен** | С A-записью, направленной на IP вашего VPS |
| **Email** | Для получения SSL-сертификата (Let's Encrypt) |
| **ПК** | Windows / macOS / Linux с SSH-клиентом |

---

## 1. Подготовка сервера

### 1.1 Покупка VPS
Купите VPS у провайдера (Timeweb Cloud, Hetzner, DigitalOcean и т.д.).  
Запишите **IP** и **root-пароль**.

### 1.2 Покупка домена
Купите домен и в DNS-настройках реестра создайте A-запись:

```
Тип: A
Хост: @
Значение: <IP вашего VPS>
```

> Может потребоваться до 24 часов для распространения DNS (обычно 5–15 минут).

---

## 2. Загрузка проекта на сервер

С вашего ПК (из папки с проектом):

```bash
# Создать папку на сервере
ssh root@<IP> "mkdir -p /var/www/vortex"

# Скопировать файлы проекта
scp -r ./* root@<IP>:/var/www/vortex/
```

> Замените `<IP>` на IP вашего VPS. При первом подключении подтвердите fingerprint (`yes`) и введите root-пароль.

---

## 3. Запуск автоматического деплоя

```bash
# Подключиться к серверу
ssh root@<IP>

# Дать права на запуск
chmod +x /var/www/vortex/deploy.sh

# Запустить деплой
/var/www/vortex/deploy.sh
```

Скрипт спросит:
- **Домен** — ваш домен (например `messenger.example.com`)
- **Email** — для SSL-сертификата

Всё остальное (Node.js, PostgreSQL, Nginx, Certbot, coturn, PM2) установится и настроится автоматически.

---

## 4. Что делает скрипт

| Шаг | Действие |
|-----|----------|
| 1/10 | Обновление системы, установка базовых утилит |
| 2/10 | Установка Node.js 20 и PM2 |
| 3/10 | Установка PostgreSQL, создание БД и пользователя |
| 4/10 | Установка Nginx |
| 5/10 | Установка Certbot для SSL |
| 6/10 | Установка coturn (TURN-сервер для звонков) |
| 7/10 | Создание `.env` с автогенерированными ключами |
| 8/10 | `npm install`, Prisma миграции, сборка бэкенда и фронтенда |
| 9/10 | Настройка Nginx (reverse proxy, SSL, блокировка доступа по IP) |
| 10/10 | Запуск сервера через PM2 с автозапуском |

По завершении:
- Кредитные данные сохраняются в `/var/www/vortex/CREDENTIALS.txt` (доступ только root)
- Скрипт обновления создаётся в `/var/www/vortex/update.sh`

---

## 5. Настройка конфигурации

Подробная инструкция по всем параметрам, которые нужно подставить под себя — в отдельном файле **[CONFIGURATION.md](CONFIGURATION.md)**.

> При использовании `deploy.sh` всё настраивается автоматически. `CONFIGURATION.md` нужен только для ручной настройки или понимания структуры.

---

## 6. После установки

Откройте в браузере:

```
https://ваш-домен.ru
```

---

## 7. Полезные команды на сервере

```bash
# ─── Подключение к серверу ───
ssh root@<IP>

# ─── Логи приложения ───
pm2 logs vortex-server              # все логи
pm2 logs vortex-server --lines 50   # последние 50 строк

# ─── Управление сервером ───
pm2 restart vortex-server            # перезапуск
pm2 stop vortex-server               # остановка
pm2 start vortex-server              # запуск
pm2 monit                            # мониторинг в реальном времени

# ─── Статус ───
pm2 status                           # список процессов
pm2 info vortex-server               # детальная информация

# ─── Nginx ───
nginx -t                             # проверить конфигурацию
systemctl reload nginx               # перезагрузить Nginx
systemctl status nginx               # статус Nginx

# ─── Логи Nginx ───
tail -f /var/log/nginx/access.log    # логи входящих запросов
tail -f /var/log/nginx/error.log     # логи ошибок

# ─── PostgreSQL ───
sudo -u postgres psql -d vortex      # подключиться к БД
\dt                                  # список таблиц (внутри psql)
\q                                   # выход из psql

# ─── coturn (TURN-сервер) ───
systemctl status coturn              # статус TURN
systemctl restart coturn             # перезапуск TURN

# ─── SSL сертификат ───
certbot renew --dry-run              # проверка обновления сертификата
certbot certificates                 # список сертификатов

# ─── Файрвол ───
ufw status                           # статус файрвола
ufw allow 22/tcp                     # SSH
ufw allow 80/tcp                     # HTTP
ufw allow 443/tcp                    # HTTPS
ufw allow 3478/tcp                   # TURN TCP
ufw allow 3478/udp                   # TURN UDP

# ─── Файлы проекта ───
ls /var/www/vortex/                  # корень проекта
cat /var/www/vortex/apps/server/.env # посмотреть env
cat /var/www/vortex/CREDENTIALS.txt  # все сгенерированные пароли
```

---

## 8. Обновление проекта

### С Windows (update-local.bat)

1. Внесите изменения в код на ПК
2. Отредактируйте `update-local.bat` — впишите IP вашего сервера в переменную `SERVER_IP`
3. Запустите `update-local.bat` — он соберёт архив и загрузит на сервер
4. Подключитесь к серверу и запустите:

```bash
ssh root@<IP>
/var/www/vortex/update.sh
```

### Вручную

```bash
# На ПК: заархивировать проект (без node_modules, dist, .env)
tar -czf vortex-deploy.tar.gz --exclude='node_modules' --exclude='dist' --exclude='.env' --exclude='uploads/avatars/*' -C . .

# Загрузить на сервер
scp vortex-deploy.tar.gz root@<IP>:/root/

# На сервере: запустить обновление
ssh root@<IP>
/var/www/vortex/update.sh
```

Скрипт `update.sh` автоматически:
- Остановит сервер
- Сделает бэкап `.env` и аватаров
- Распакует обновление
- Восстановит `.env` и аватары
- Установит зависимости, применит миграции, пересоберёт
- Запустит сервер

---

## 8.1. Мобильное приложение (Android APK)

APK раздаётся напрямую с сервера, без Google Play. Подробности —
в [MOBILE_APP.md](MOBILE_APP.md).

### Что нужно на сервере

```bash
# 1. Каталог для APK
mkdir -p /var/www/vortex/apps/server/downloads

# 2. Блок nginx для раздачи (см. deploy.sh, location /downloads/)
nano /etc/nginx/sites-available/vortex
nginx -t && systemctl reload nginx

# 3. Таблица DeviceToken для push-токенов
cd /var/www/vortex && npm run db:push

# 4. (опционально) FCM для push-уведомлений
#    Положить fcm-service-account.json в apps/server/
#    и добавить в apps/server/.env:
#      FCM_SERVICE_ACCOUNT=fcm-service-account.json
pm2 restart vortex-server
```

### Публикация новой версии (с рабочей машины)

```powershell
.\publish-apk.ps1 -Deploy -SshHost <IP> -Changelog "Что нового"
```

Проверка: `https://ваш-домен.ru/api/app-version` должен вернуть JSON
с `versionCode`, а ссылка из поля `url` — отдавать APK.

---

## 8.2. Метаданные медиа (превью и waveform)

Чтобы список сообщений не декодировал полноразмерные файлы при скролле,
в таблице `Media` хранятся «дешёвые» метаданные:

| Поле | Для чего | Кто заполняет |
|------|----------|---------------|
| `thumbnail` | уменьшенная копия картинки в пузыре | клиент при отправке |
| `width` / `height` | резерв места под картинку (нет «прыжков» ленты) | клиент при отправке |
| `waveform` | пики голосового без `decodeAudioData()` | клиент при записи |

### Обязательно после обновления схемы

```bash
cd /var/www/vortex && npm run db:push       # добавляет Media.waveform
pm2 restart vortex-server
```

Без `db:push` сервер упадёт при вставке media: колонки `waveform` ещё нет.

### Проверка и бэкофилл старых файлов

```bash
cd /var/www/vortex

# 1. Схема на месте и Prisma пишет/читает waveform
npm run db:check-waveform -w apps/server

# 2. Сколько записей идёт по медленному fallback-пути
npm run db:media-stats -w apps/server

# 3. Превью для старых изображений (сначала посмотреть план)
npm run db:backfill-thumbnails -w apps/server -- --dry-run
npm run db:backfill-thumbnails -w apps/server

# 4. Убедиться, что превью читаются и не больше 720px
npm run db:verify-thumbnails -w apps/server
```

Замечания:

- бэкофилл идемпотентен — существующие `thumbnail` не перезаписываются,
  можно прогонять частями через `-- --limit N`;
- файлы, зашифрованные **прежним** `ENCRYPTION_KEY`, не расшифровываются:
  скрипт их считает и пропускает (строка «Не читается как img»), оригинал
  продолжает отдаваться как раньше;
- `waveform` для старых голосовых на сервере не восстанавливается (нужен
  ffmpeg, его в зависимостях нет) — клиент считает их fallback-декодом:
  строго по одному файлу за раз, с кешем и дедупликацией запросов.

---

## 9. Устранение проблем

| Проблема | Решение |
|----------|---------|
| Сайт не открывается | `pm2 logs vortex-server --lines 30` — проверить ошибки |
| 502 Bad Gateway | `pm2 restart vortex-server` — бэкенд упал |
| SSL не получен | Проверить DNS: `dig +short ваш-домен.ru` должен показать IP сервера. Повторить: `certbot --nginx -d ваш-домен.ru` |
| Звонки не работают | `systemctl status coturn` — проверить TURN-сервер. Порты 3478 TCP/UDP должны быть открыты |
| БД недоступна | `systemctl status postgresql` → `systemctl start postgresql` |
| `prisma db push` падает с «нужно быть владельцем таблицы ChatMember» (PostgreSQL 42501) | Таблицы принадлежат `postgres`, а не пользователю из `DATABASE_URL`. Передать владение: `sudo -u postgres psql -d vortex -f /var/www/vortex/apps/server/prisma/fix-table-owner.sql`, затем повторить `npx prisma db push` |
| Сервер не стартует после ребута | `pm2 startup` и `pm2 save` |
| Нет места на диске | `df -h` → очистить логи: `pm2 flush` |

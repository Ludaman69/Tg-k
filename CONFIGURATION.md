# Vortex Messenger — Настройка конфигурации

> Если вы используете `deploy.sh` — всё ниже подставляется автоматически.  
> Этот файл нужен для ручной настройки или если вы хотите понимать, что где лежит.

---

## 1. Файл `update-local.bat` (на вашем ПК)

Откройте файл и замените IP на ваш:

```
set SERVER_IP=<IP вашего VPS>
```

---

## 2. Файл `apps/server/.env` (на сервере)

Скопируйте `.env.example` и заполните:

```env
# Порт HTTP-сервера (обычно менять не нужно)
PORT=3001

# Секрет для подписи JWT-токенов — длинная случайная строка
# Сгенерировать: node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
JWT_SECRET=<ВАШ_СЛУЧАЙНЫЙ_СЕКРЕТ>

# Строка подключения к PostgreSQL
# Формат: postgresql://ПОЛЬЗОВАТЕЛЬ:ПАРОЛЬ@localhost:5432/ИМЯ_БАЗЫ
DATABASE_URL=postgresql://vortex:<ПАРОЛЬ_БД>@localhost:5432/vortex

# Ключ шифрования сообщений (64 hex-символа = 32 байта)
# Сгенерировать: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# ⚠ ВАЖНО: при утере ключа все зашифрованные сообщения станут нечитаемы!
ENCRYPTION_KEY=<64_HEX_СИМВОЛА>

# Режим работы
NODE_ENV=production

# Разрешённые домены для CORS (ваш домен с https://)
CORS_ORIGINS=https://<ВАШ_ДОМЕН>

# Лимит регистраций с одного IP
MAX_REGISTRATIONS_PER_IP=5

# TURN-сервер для звонков (coturn)
TURN_URL=turn:<ВАШ_ДОМЕН>:3478
TURN_SECRET=<СЕКРЕТ_TURN_СЕРВЕРА>
STUN_URLS=stun:stun.l.google.com:19302,stun:<ВАШ_ДОМЕН>:3478
```

---

## 3. Конфигурация coturn (на сервере)

Файл `/etc/turnserver.conf`:

```
realm=<ВАШ_ДОМЕН>
server-name=<ВАШ_ДОМЕН>
static-auth-secret=<СЕКРЕТ_TURN_СЕРВЕРА>   # тот же что TURN_SECRET в .env
```

---

## 4. Nginx (на сервере)

Файл `/etc/nginx/sites-available/vortex` — замените `server_name`:

```
server_name <ВАШ_ДОМЕН>;
```

---

## 5. Генерация ключей

```bash
# JWT-секрет (64 символа)
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"

# Ключ шифрования сообщений (64 hex-символа)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Пароль для базы данных (32 символа)
node -e "console.log(require('crypto').randomBytes(24).toString('base64url').slice(0,32))"

# TURN-секрет (32 символа)
node -e "console.log(require('crypto').randomBytes(24).toString('base64url').slice(0,32))"
```

---

## 6. Сводная таблица

| Где | Что заменить | Пример значения |
|-----|-------------|-----------------|
| `update-local.bat` строка 9 | `SERVER_IP` | `203.0.113.50` |
| `.env` → `JWT_SECRET` | Случайная строка 64+ символов | см. раздел 5 |
| `.env` → `DATABASE_URL` | Пароль пользователя БД | `postgresql://vortex:MyPass123@localhost:5432/vortex` |
| `.env` → `ENCRYPTION_KEY` | 64 hex-символа | см. раздел 5 |
| `.env` → `CORS_ORIGINS` | Ваш домен с `https://` | `https://chat.example.com` |
| `.env` → `TURN_URL` | Ваш домен | `turn:chat.example.com:3478` |
| `.env` → `TURN_SECRET` | Случайная строка | см. раздел 5 |
| `/etc/turnserver.conf` | `realm`, `server-name`, `static-auth-secret` | Ваш домен + TURN_SECRET |
| Nginx → `server_name` | Ваш домен | `chat.example.com` |

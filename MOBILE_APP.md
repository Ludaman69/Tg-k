# Мобильное приложение Bkonekte (Capacitor / Android)

PWA обёрнут в нативное Android-приложение через **Capacitor 8**.
APK раздаётся **напрямую с сервера** (не через Google Play), обновления
проверяются самим приложением.

Для iOS нативной сборки нет — там используется PWA («На экран Домой»),
но весь код уже кроссплатформенный, поэтому `npx cap add ios` на Mac
заработает без доработок.

---

## 📁 Структура

```
apps/web/
├── capacitor.config.ts        # Конфигурация Capacitor
├── .env.native                # VITE_API_ORIGIN для нативной сборки
├── android/                   # Android-проект (создан cap add android)
│   ├── app/build.gradle       # versionCode / versionName / подпись
│   ├── keystore.properties    # Параметры подписи (НЕ в git)
│   └── app/src/main/
│       ├── AndroidManifest.xml
│       └── java/com/bkonekte/app/
│           ├── MainActivity.java        # + разрешения WebRTC
│           └── NotificationChannels.java # каналы FCM
└── src/lib/
    ├── env.ts                 # IS_NATIVE, API_ORIGIN, PLATFORM
    ├── media.ts               # mediaUrl() + подбор mime для записи
    ├── native.ts              # status bar, клавиатура, кнопка «Назад»
    └── appUpdater.ts          # скачивание и установка APK

android-twa/                   # Старая TWA-обёртка (legacy)
publish-apk.ps1                # Сборка + публикация APK
generate-android-assets.ps1    # Генерация иконок и splash
```

---

## ⚙️ Требования

| Компонент | Версия | Где взять |
|---|---|---|
| Node.js | 22+ | установлен (24.15.0) |
| **JDK** | **21** | `C:\tools\java\jdk-21.0.12.1+1` |
| Android SDK | API 36 + build-tools 36 | `C:\tools\android` |
| Gradle | 8.14.3 | скачивается wrapper'ом |

> ⚠️ Capacitor 8 требует именно **JDK 21**. JDK 17 (для TWA) не подойдёт.

---

## 🚀 Сборка APK

```powershell
# Полная сборка release APK
.\publish-apk.ps1

# Сборка + публикация на сервер
.\publish-apk.ps1 -Deploy -SshHost <IP> -Changelog "Исправлены звонки","Ускорена загрузка"

# Debug-сборка (для тестирования на устройстве)
.\publish-apk.ps1 -Debug

# Обязательное обновление (нельзя отложить)
.\publish-apk.ps1 -Deploy -SshHost <IP> -Mandatory
```

Скрипт выполняет: `tsc` → `vite build --mode native` → `cap sync` →
`gradlew assembleRelease` → копирование в `apps/server/downloads/` →
формирование `version.json` → (опционально) `scp` на сервер.

### Вручную

```powershell
$env:JAVA_HOME = "C:\tools\java\jdk-21.0.12.1+1"
$env:ANDROID_HOME = "C:\tools\android"

npm run android:release        # из корня проекта
# APK: apps/web/android/app/build/outputs/apk/release/bkonekte-<version>.apk
```

---

## 🔢 Выпуск новой версии

1. Поднять версии в `apps/web/android/app/build.gradle`:
   ```gradle
   versionCode 201      // строго больше предыдущего
   versionName "2.0.1"
   ```
2. Синхронизировать версию web-части в `apps/web/package.json` (для UI).
3. Запустить `.\publish-apk.ps1 -Deploy -SshHost <IP> -Changelog "..."`.
4. Установленные приложения увидят обновление при следующем запуске.

> `versionCode` начинается с **200**, так как в Google Play уже была
> TWA-версия 117 — APK должен быть новее, чтобы установиться поверх.

---

## 🎨 Иконки и splash

Генерируются из `apps/web/public/logo.png`:

```powershell
.\generate-android-assets.ps1
```

Создаёт `ic_launcher`, `ic_launcher_round`, `ic_launcher_foreground`,
`ic_stat_icon` (для push) и `splash.png` во всех плотностях.

---

## 🔔 Push-уведомления (FCM)

В нативном приложении Web Push недоступен — используется Firebase Cloud
Messaging. Web-версия продолжает работать на VAPID, оба канала живут
параллельно (см. `apps/server/src/pushService.ts`).

### Настройка

1. Создать проект в [Firebase Console](https://console.firebase.google.com).
2. Добавить Android-приложение с package name `com.bkonekte.app`.
3. Скачать `google-services.json` → положить в `apps/web/android/app/`.
4. Project settings → Service accounts → **Generate new private key** →
   сохранить как `apps/server/fcm-service-account.json`.
5. В `apps/server/.env` добавить:
   ```
   FCM_SERVICE_ACCOUNT=fcm-service-account.json
   ```
6. Применить схему БД (появилась таблица `DeviceToken`):
   ```powershell
   npm run db:push
   ```
7. Перезапустить сервер.

Каналы уведомлений (`bkonekte_messages`, `bkonekte_calls`) создаются
автоматически в `NotificationChannels.java`.

> Без `FCM_SERVICE_ACCOUNT` приложение работает, но уведомления приходят
> только при открытом приложении (через WebSocket).

---

## 🖥 Настройка сервера

### 1. CORS

Origins нативного WebView (`https://localhost`, `capacitor://localhost`)
добавляются в CORS **автоматически** — править `CORS_ORIGINS` не нужно
(см. `apps/server/src/config.ts`).

### 2. Каталог раздачи APK

```bash
mkdir -p /var/www/vortex/apps/server/downloads
```

Туда `publish-apk.ps1 -Deploy` кладёт APK и `version.json`.

### 3. Nginx

Блок `location /downloads/` уже добавлен в `deploy.sh`. При обновлении
существующего сервера добавьте вручную в конфиг сайта:

```nginx
location /downloads/ {
    alias /var/www/vortex/apps/server/downloads/;

    location ~* \.apk$ {
        default_type application/vnd.android.package-archive;
        add_header Content-Disposition "attachment";
        add_header Accept-Ranges bytes;
        expires 1d;
    }

    location ~ ^/downloads/(?!.*\.apk$) {
        return 404;
    }
}
```

### Проверка

```
https://tg-k.ru/api/app-version          → метаданные версии
https://tg-k.ru/downloads/bkonekte-2.0.0.apk  → скачивание
```

---

## 🔄 Как работает самообновление

1. При запуске и возврате из фона приложение запрашивает `/api/app-version`.
2. Сравнивает `versionCode` с установленным (через `@capacitor/app`).
3. Если на сервере новее — показывает `UpdatePrompt` с changelog.
4. По нажатию «Обновить»: APK скачивается в кеш (`@capacitor/filesystem`)
   с прогрессом → открывается системный установщик (`FileOpener`).
5. Android запросит разрешение на установку из этого источника (нормально
   для приложений вне Google Play).

При `mandatory: true` окно нельзя закрыть.

---

## 🧪 Тестирование

```powershell
# Установка на подключённое устройство
adb install -r apps\web\android\app\build\outputs\apk\release\bkonekte-2.0.0.apk

# Логи приложения
adb logcat | Select-String "Capacitor|Bkonekte|chromium"

# Отладка WebView: открыть chrome://inspect в Chrome на ПК
```

### Live reload (быстрая разработка)

Временно добавить в `capacitor.config.ts`:

```ts
server: {
  url: 'http://192.168.1.100:5173',  // IP компьютера в локальной сети
  cleartext: true,
  androidScheme: 'https',
}
```

Затем `npx cap sync android` и запустить `npm run dev`.
**Не забыть убрать перед релизной сборкой.**

### Чек-лист

- [ ] Вход / регистрация
- [ ] WebSocket (онлайн-статусы, доставка сообщений)
- [ ] Отправка фото, файла, голосового, видеокружка
- [ ] Аудио- и видеозвонок (проверить TURN)
- [ ] Истории: просмотр и создание
- [ ] Push при закрытом приложении
- [ ] Safe-area (вырез экрана, нижняя панель)
- [ ] Кнопка «Назад» (закрывает модалки, не выходит из приложения)
- [ ] Клавиатура не перекрывает поле ввода
- [ ] Самообновление APK

---

## 🛠 Troubleshooting

| Проблема | Причина и решение |
|---|---|
| Белый экран | Проверьте `VITE_API_ORIGIN` в `.env.native` — без него API недоступен. Смотрите `chrome://inspect` |
| Ошибки CORS в консоли | Сервер не перезапущен после правки `config.ts` |
| Не работают звонки | Нет разрешений камеры/микрофона, либо не настроен TURN |
| Нет шеринга экрана | Так и должно быть: `getDisplayMedia` не поддерживается в WebView, кнопка скрыта |
| Не приходят push | Не настроен FCM (см. выше) или нет Google Play Services на устройстве |
| APK не устанавливается поверх | Разные подписи. Нужен тот же keystore (`android-twa/bkonekte-release.keystore`) |
| `versionCode` ниже установленного | Android не даст «понизить» версию — поднимите `versionCode` |
| Gradle не видит SDK | Проверьте `apps/web/android/local.properties` → `sdk.dir` |
| Ошибка JDK при сборке | Capacitor 8 требует JDK 21, не 17 |

---

## 📱 iOS (на будущее)

Код уже кроссплатформенный. На Mac достаточно:

```bash
npx cap add ios
npx cap sync ios
```

Затем в `ios/App/App/Info.plist` добавить `NSCameraUsageDescription`,
`NSMicrophoneUsageDescription`, `NSPhotoLibraryUsageDescription`.

> ⚠️ Apple не позволяет устанавливать IPA с сайта без Enterprise-аккаунта
> ($299/год) или Ad-Hoc (максимум 100 устройств). Поэтому для iOS
> остаётся PWA-вариант, который уже работает.


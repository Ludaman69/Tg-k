# TWA (Trusted Web Activity) для Bkonekte

Android-обёртка TWA для вашего PWA. Позволяет опубликовать PWA в Google Play Store как нативное Android-приложение.

## 📁 Структура

```
android/
├── app/
│   ├── build.gradle
│   └── src/main/
│       ├── AndroidManifest.xml
│       ├── java/com/bkonekte/app/
│       │   ├── MainActivity.kt
│       │   └── fcm/BkonekteMessagingService.kt
│       └── res/
├── .well-known/assetlinks.json    # Шаблон Digital Asset Links
├── build.gradle
├── settings.gradle
├── gradle.properties
├── local.properties
├── build-twa.ps1                  # Скрипт сборки
├── generate-assetlinks.ps1       # Генератор assetlinks.json
└── README-TWA.md
```

## ⚙️ Требования

- **Java JDK 17+** ✅ (установлен)
- **Android SDK** ✅ (ANDROID_HOME задан)
- **Android устройство** для тестирования

## 🚀 Быстрый старт

### 1. Настройте домен

Замените `tg-k.ru` во всех файлах на ваш реальный домен (если потребуется):

| Файл | Что заменить |
|------|-------------|
| `app/build.gradle` | `TWA_URL` (уже `tg-k.ru`) |
| `AndroidManifest.xml` | `android:host` и `DEFAULT_URL` (уже `tg-k.ru`) |
| `app/src/main/res/values/strings.xml` | `default_url` (уже `tg-k.ru`) |

### 2. Создайте keystore для подписи

```powershell
cd android
keytool -genkey -v -keystore bkonekte-release.keystore ^
    -alias bkonekte -keyalg RSA -keysize 2048 -validity 10000 ^
    -storepass android -keypass android ^
    -dname "CN=Bkonekte, OU=Development, O=Bkonekte, L=Moscow, ST=RU, C=RU"
```

### 3. Сгенерируйте Digital Asset Links

```powershell
cd android
.\generate-assetlinks.ps1
```

Скрипт создаст keystore (если нет), извлечёт SHA256 fingerprint и сгенерирует `assetlinks.json`.

### 4. Разместите файл на сервере

Скопируйте `assetlinks.json` на сервер:

```
https://tg-k.ru/.well-known/assetlinks.json
```

**Важно:**
- Должен быть доступен по **HTTPS** (200, Content-Type: `application/json`)
- **Проверка верификации:**
  ```
  https://digitalassetlinks.googleapis.com/v1/statements:list?
      source.web.site=https://tg-k.ru&
      relation=delegate_permission/common.handle_all_urls
  ```

### 5. Соберите TWA

```powershell
cd android

# Debug APK (для тестирования)
.\build-twa.ps1

# Release AAB (для Google Play)
.\build-twa.ps1 -Release

# Сборка + установка на устройство
.\build-twa.ps1 -Install
```

### 6. Тестирование

1. Установите APK на Android-устройство (Android 6+)
2. Откройте приложение — должно открыться **без адресной строки**
3. Проверьте:
   - ✅ Полноэкранный режим
   - ✅ Deep links с вашего домена
   - ✅ Push-уведомления (если настроен FCM)
   - ✅ Офлайн-режим (Service Worker)
   - ✅ Splash screen при запуске

### ⚠ Если адресная строка видна

- Проверьте, что `assetlinks.json` доступен по HTTPS
- Проверьте SHA256 fingerprint — должен совпадать с подписью APK
- Для debug APK используйте debug-ключ SDK (другой fingerprint)
- Перезапустите Chrome на устройстве: `Настройки → Приложения → Chrome → Очистить кэш`

## 🔥 Firebase Cloud Messaging (Push-уведомления)

Для работы push-уведомлений в TWA через Google Play требуется FCM.

### Настройка:

1. Создайте проект в [Firebase Console](https://console.firebase.google.com)
2. Добавьте Android-приложение:
   - Package name: `com.bkonekte.app`
   - Скачайте `google-services.json`
3. Скопируйте `google-services.json` в `android/app/`
4. В файлах проекта раскомментируйте блоки FCM (помечены `<!-- FCM -->` или `// FCM`)
5. В корневом `build.gradle` добавьте:
   ```gradle
   plugins {
       id("com.google.gms.google-services") version "4.4.2" apply false
   }
   ```

## 🔄 Обновление

### PWA (сайт):
Продолжаете обновлять через деплой на сервер. TWA подхватит новую версию автоматически.

### TWA (Android):
Только если меняются нативные настройки (иконки, deep links, разрешения). Соберите новый AAB и загрузите в Google Play Console.

## 🛠 Отладка

```powershell
# Установка APK
adb install -r app/build/outputs/apk/debug/app-debug.apk

# Логи TWA
adb logcat -s "TWABrowser"
adb logcat -s "ChromeCustomTab"

# Проверка Digital Asset Links
adb shell dumpsys package com.bkonekte.app | findstr /C:"verify"

# Chrome DevTools на устройстве:
# chrome://inspect → найти TWA процесс → открыть DevTools
```

## 💡 Советы

- Debug и Release имеют **разные SHA256 fingerprint**
- При первом запуске может быть адресная строка (Chrome проверяет DAL в фоне)
- Для iOS — используйте PWABuilder.com (iOS не поддерживает TWA)
- Push-уведомления через FCM требуют **серверной части** (ваш сервер отправляет через Firebase API)

## 📚 Полезные ссылки

- [TWA от Google](https://developer.chrome.com/docs/android/trusted-web-activity/)
- [Digital Asset Links](https://developers.google.com/digital-asset-links/v1/getting-started)
- [PWABuilder](https://pwabuilder.com)
- [android-browser-helper](https://github.com/GoogleChrome/android-browser-helper)
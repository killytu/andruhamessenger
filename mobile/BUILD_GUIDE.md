# 📱 ANDRUHA MESSENGER — Сборка APK и iOS

## Что нужно

| Платформа | Требования |
|-----------|------------|
| Android APK | Node.js, EAS CLI, аккаунт Expo (бесплатно) |
| iOS IPA | Node.js, EAS CLI, аккаунт Apple Developer ($99/год) |
| Локальная Android | Node.js, Android Studio + JDK 17 |

---

## 🤖 Android APK — самый простой способ (EAS Cloud)

### 1. Установка

```bash
npm install -g eas-cli
cd mobile
npm install
```

### 2. Вход в Expo

```bash
eas login
# Создай аккаунт на expo.dev если нет (бесплатно)
```

### 3. Инициализация проекта

```bash
eas build:configure
# Выбери: Android
```

### 4. Сборка APK (бесплатно, без подписи — для тестирования)

```bash
eas build --platform android --profile preview
```

Через 5-15 минут получишь ссылку для скачивания APK.

### 5. Сборка подписанного AAB (для Google Play)

```bash
eas build --platform android --profile production
```

---

## 🍎 iOS IPA

### Требования
- Аккаунт Apple Developer (`$99/год`)
- macOS (для локальной сборки) или EAS Cloud

```bash
eas build --platform ios --profile production
```

EAS автоматически создаст сертификаты и provisioning profiles.

---

## 🔧 Локальная сборка APK (без Expo аккаунта)

### 1. Установи Android Studio

Скачай с `developer.android.com/studio`  
В Android Studio: SDK Manager → установи Android SDK 34 + Build Tools

### 2. Установи JDK 17

```bash
# Windows (через winget)
winget install Microsoft.OpenJDK.17

# macOS
brew install --cask temurin@17

# Linux
sudo apt install openjdk-17-jdk
```

### 3. Сборка

```bash
cd mobile
npm install
npx expo run:android
# Запустит эмулятор и соберёт debug APK
```

### 4. Готовый APK будет по пути:
```
android/app/build/outputs/apk/debug/app-debug.apk
```

---

## eas.json (конфиг сборки)

```json
{
  "build": {
    "preview": {
      "android": {
        "buildType": "apk"
      }
    },
    "production": {
      "android": {
        "buildType": "app-bundle"
      },
      "ios": {
        "resourceClass": "m-medium"
      }
    }
  }
}
```

Создай этот файл в папке `mobile/` перед запуском `eas build`.

---

## Проверка на телефоне без сборки (Expo Go)

```bash
cd mobile
npm install
npx expo start
```

Открой приложение **Expo Go** на телефоне → сканируй QR-код.

> ⚠️ Expo Go не поддерживает нативные модули типа SecureStore в полной мере. Для production — используй EAS build.

---

## Подключение к серверу с телефона

Телефон и сервер должны быть в одной Wi-Fi сети.

```
Узнай IP компьютера с сервером:
  Windows: ipconfig → IPv4 Address
  Linux:   ip addr show | grep "inet "
  
Адрес сервера: ws://192.168.x.x:8080/ws
```

В приложении: Настройки → Сервер → ввести этот адрес.

---

## Структура React Native проекта

```
mobile/
├── src/
│   ├── lib/
│   │   ├── crypto.js      ← Shared с web (ECDH + Ratchet)
│   │   ├── ws.js          ← Shared с web (WSClient)
│   │   └── storage.js     ← SecureStore + AsyncStorage
│   └── screens/
│       └── ChatScreen.jsx ← Основной экран
├── app.json               ← Expo конфиг
├── eas.json               ← EAS Build конфиг
└── package.json
```

## Зависимости для полноценного P2P на мобильном

Для WebRTC на React Native нужно добавить:

```bash
npm install react-native-webrtc
```

И добавить в `app.json`:
```json
{
  "expo": {
    "plugins": ["react-native-webrtc"]
  }
}
```

> Это требует managed workflow → bare workflow через `npx expo prebuild`.

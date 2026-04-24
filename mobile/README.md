# 📱 ANDRUHA MESSENGER — Mobile (React Native / Expo)

## Запуск

```bash
cd mobile
npm install
npx expo start
# Сканируй QR-код в Expo Go (iOS/Android)
```

## Сборка APK (Android)

```bash
npm install -g eas-cli
eas login
eas build --platform android --profile preview
```

## Особенности RN версии

- Те же ECDH P-256 + AES-256-GCM + Double Ratchet
- Секретный ключ хранится в **Expo SecureStore** (keychain/keystore)
- WebSocket — нативный RN WebSocket API
- Web Crypto API работает через Hermes (Expo 49+)
- P2P через WebRTC — требует `react-native-webrtc` (добавляется отдельно)

## Структура

```
mobile/
├── src/
│   ├── lib/
│   │   ├── crypto.js   — Ratchet + ECDH (shared с web)
│   │   ├── ws.js       — WebSocket клиент (shared с web)
│   │   └── storage.js  — SecureStore + AsyncStorage
│   └── screens/
│       └── ChatScreen.jsx
├── app.json
└── package.json
```

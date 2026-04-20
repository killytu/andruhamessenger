<div align="center">

# 🔐 Andruha Messenger

**Гибридный мессенджер с E2E-шифрованием, WebRTC P2P и Double Ratchet**

![CI](https://github.com/YOUR_USERNAME/andruha-messenger/actions/workflows/ci.yml/badge.svg)
![Go](https://img.shields.io/badge/Go-1.21-00ADD8?logo=go&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)
![Electron](https://img.shields.io/badge/Electron-28-47848F?logo=electron&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-00d4be)

[Запуск](#-быстрый-старт) · [Архитектура](#-архитектура) · [Протокол](#-протокол) · [Тест на 2 ПК](#-тест-на-двух-компьютерах)

</div>

---

## О проекте

Andruha Messenger — мессенджер, где **сервер не может читать твои сообщения**. Он работает как тупой relay — пересылает зашифрованные байты и не хранит их. При P2P соединении сервер вообще не участвует в передаче данных.

### Ключевые принципы

- **Без номера телефона** — идентичность это криптографическая пара ключей
- **Offline-first** — работает без сервера через WebRTC P2P
- **Forward Secrecy** — компрометация одного ключа не раскрывает прошлые сообщения
- **Сессия по приватному ключу** — войди на любом устройстве с одним ключом

---

## 🔐 Безопасность

| Слой | Алгоритм | Назначение |
|------|----------|------------|
| Обмен ключами | **ECDH P-256** | Вычисление shared secret без передачи по сети |
| Шифрование | **AES-256-GCM** | Каждое сообщение, уникальный IV |
| Ratchet | **Double Ratchet** | Новый ключ на каждое сообщение, Forward Secrecy |
| Аутентификация | **Приватный ключ** | Вход без пароля и без сервера |
| Сессия | **JWK → localStorage** | Восстановление ключей между сессиями |

### Что сервер видит

```
{ "from": "alice", "to": "bob", "payload": { "iv": "a3f...", "ct": "8d2..." } }
```
Только зашифрованные байты. `iv` — случайный nonce. `ct` — ciphertext. Расшифровать без ключа невозможно.

---

## 🏗 Архитектура

```
┌─────────────────────────────────────────────────────────┐
│                    РЕЖИМЫ РАБОТЫ                        │
│                                                         │
│  Relay (основной)        P2P (лучший)                   │
│  ┌──────┐  ┌──────┐      ┌──────────────────┐           │
│  │Alice │→ │ Go   │→│Bob │  Alice ←WebRTC→ Bob│          │
│  │      │  │Relay │  │   │  Сервер не нужен  │           │
│  └──────┘  └──────┘  └───┘  └────────────────┘           │
│  Сервер видит {iv,ct}       Никто ничего не видит        │
└─────────────────────────────────────────────────────────┘
```

### Поток сообщения

```
1. Alice пишет "привет"
2. Ratchet.encrypt("привет")
   → прокручивает цепочку: sendChain → HKDF → newChain + msgKey
   → AES-256-GCM(msgKey, "привет") → { iv, ct, idx: 5 }
   → sendChain = newChain (старый уничтожается — Forward Secrecy)
3. Выбор маршрута:
   → P2P open? → DataChannel.send({ iv, ct, idx })
   → иначе     → WebSocket → relay server → WebSocket
4. Bob получает { iv, ct, idx }
   → Ratchet.decrypt(iv, ct, idx=5)
   → прокручивает recvChain до idx
   → AES-256-GCM.decrypt(msgKey, ct) → "привет"
```

---

## 📁 Структура проекта

```
andruha-messenger/
├── .github/
│   └── workflows/ci.yml        — CI/CD (Go + React + Docker)
├── server/
│   ├── main.go                 — HTTP/WS сервер, порт 8080
│   ├── hub.go                  — Центральный роутер (горутин)
│   ├── client.go               — WS соединение + протокол
│   └── Dockerfile
├── client/
│   ├── electron/
│   │   ├── main.cjs            — Electron main process
│   │   └── preload.cjs         — Безопасный IPC мост
│   ├── src/
│   │   ├── App.jsx             — UI (Auth / Register / Login / Chat)
│   │   ├── crypto.js           — ECDH + AES + Double Ratchet
│   │   ├── session.js          — Сессия, localStorage, персистенция
│   │   ├── webrtc.js           — WebRTC P2P менеджер
│   │   ├── ws.js               — WebSocket + сигналинг
│   │   └── main.jsx
│   ├── package.json
│   └── Dockerfile
├── docker-compose.yml
├── Makefile
└── .gitignore
```

---

## 🚀 Быстрый старт

### Вариант 1: Docker (рекомендуется)

```bash
git clone https://github.com/YOUR_USERNAME/andruha-messenger
cd andruha-messenger
docker-compose up --build

# Клиент:  http://localhost:3000
# Сервер:  ws://localhost:8080/ws
# Health:  http://localhost:8080/health
```

### Вариант 2: Локальная разработка

```bash
# Терминал 1 — сервер Go
cd server
go mod download
go run .

# Терминал 2 — React клиент
cd client
npm install
npm run dev
# → http://localhost:5173
```

### Вариант 3: Electron (desktop приложение)

```bash
cd client
npm install

# Dev режим (Vite + Electron вместе)
npm run electron:dev

# Собрать .exe / .dmg / .AppImage
npm run electron:build
```

---

## 💬 Функционал

### Аутентификация
- **Создать аккаунт** — генерация ECDH P-256 ключевой пары
- **Войти по ключу** — восстановление через приватный ключ (hex)
- **Сессия** — автоматический вход при повторном открытии
- **Профиль** — просмотр и копирование публичного/приватного ключа

### Чат
- **E2EE сообщения** — ECDH + Double Ratchet + AES-256-GCM
- **Статусы** — `⏳` отправляется → `✓` доставлено → `✓✓` прочитано
- **Счётчик непрочитанных** — сбрасывается при открытии чата
- **Удаление чата** — удаляет сообщения + Ratchet состояние
- **Превью** — последнее сообщение в списке контактов

### Соединение
- **WebSocket Relay** — основной режим, сервер = тупой relay
- **WebRTC P2P** — прямое соединение, диалог согласия у получателя
- **Offline режим** — работает без сервера при P2P соединении
- **Автореконнект** — при обрыве соединения

### Безопасность
- **Double Ratchet** — две независимые цепочки (A→B и B→A)
- **Forward Secrecy** — ключи уничтожаются после использования
- **Персистенция Ratchet** — состояние сохраняется, сообщения работают после перезапуска

---

## 🖥️ Тест на двух компьютерах

**Компьютер A:**
```bash
# Узнать IP
ip addr show      # Linux
ipconfig          # Windows
# Например: 192.168.1.100

# Запустить
cd server && go run .
cd client && npm run dev
```

**Компьютер B — открыть браузер:**
```
http://192.168.1.100:5173
```

**Сценарий теста:**
```
A: Создать аккаунт "alice"
B: Создать аккаунт "bob"

A: Добавить контакт "bob" → ключ получен → Ratchet инициализирован
B: Добавить контакт "alice" → то же самое

A → B: "привет" [relay, ✓ доставлено]
B → A: "привет alice!" [relay]

A: нажать [🔗 P2P]
B: появится диалог → нажать "Принять P2P"
   WebRTC handshake через сервер → DataChannel открыт

A → B: "теперь P2P" [прямое соединение, сервер не участвует]

# Перезапустить браузер A
# Сессия восстанавливается автоматически
# Ratchet продолжает работу с сохранёнными счётчиками
```

---

## 🌐 Деплой на VPS

```bash
git clone https://github.com/YOUR_USERNAME/andruha-messenger
cd andruha-messenger
docker-compose up -d

# Открыть порты
ufw allow 8080
ufw allow 3000
```

### HTTPS + домен

```nginx
server {
    listen 443 ssl;
    server_name messenger.yourdomain.com;

    location /ws {
        proxy_pass http://127.0.0.1:8080/ws;
        proxy_http_version 1.1;
        proxy_set_header Upgrade    $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 86400;
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
    }
}
```

---

## 📤 Первый push на GitHub

```bash
cd andruha-messenger
git init
git add .
git commit -m "feat: initial — E2EE relay + WebRTC P2P + Double Ratchet + Session"
git remote add origin https://github.com/YOUR_USERNAME/andruha-messenger.git
git branch -M main
git push -u origin main
```
> Замени `YOUR_USERNAME` на свой GitHub логин. CI запустится автоматически.

---

## 🗺 Roadmap

- [x] ECDH P-256 + AES-256-GCM шифрование
- [x] WebSocket Relay сервер (Go)
- [x] Double Ratchet (Forward Secrecy)
- [x] WebRTC P2P
- [x] Сессия / вход по приватному ключу
- [x] Удаление чатов
- [x] Electron desktop app
- [ ] Double Ratchet DH часть (полный Signal Protocol)
- [ ] Offline message queue
- [ ] Android клиент (Kotlin)
- [ ] Bluetooth / Wi-Fi Direct mesh
- [ ] Групповые чаты

---

<div align="center">
MIT License · Сделано с ❤️ · <a href="https://github.com/YOUR_USERNAME/andruha-messenger">GitHub</a>
</div>

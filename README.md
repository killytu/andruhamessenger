<div align="center">

# 🔐 ANDRUHA MESSENGER

**Гибридный мессенджер с E2E-шифрованием, WebRTC P2P и Double Ratchet**

![Go](https://img.shields.io/badge/Go-1.21-00ADD8?logo=go&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)
![Electron](https://img.shields.io/badge/Electron-28-47848F?logo=electron&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-00d4be)

</div>

---

## О проекте

ANDRUHA MESSENGER — мессенджер, где **сервер физически не может читать сообщения**.  
Работает как тупой relay: пересылает зашифрованные байты не храня их.  
При P2P соединении сервер **вообще не участвует** в передаче данных.

---

## Архитектура

```
[Alice]                              [Bob]
ECDH keygen                        ECDH keygen
Double Ratchet                     Double Ratchet
AES-256-GCM encrypt                AES-256-GCM decrypt
   │                                   │
   └──────── WebSocket / WebRTC ────────┘
                    │
             [Relay Server]
              Go · JSON DB
           Видит: {iv, ct} байты
           НЕ видит: содержимое
```

**Три режима доставки:**
- **Relay** — через Go сервер (основной). Сервер = тупой relay, видит только зашифрованные байты.
- **P2P WebRTC** — напрямую между устройствами. Сервер нужен только для handshake.
- **Offline P2P** — через общую Wi-Fi сеть без интернета. ICE находит LAN путь.

---

## Криптография

| Слой | Алгоритм | Назначение |
|------|----------|------------|
| Обмен ключами | **ECDH P-256** | Вычисление shared secret без его передачи |
| Вывод ключей | **HKDF-SHA256** | Две независимые цепочки (send/recv) |
| Шифрование | **AES-256-GCM** | Каждое сообщение + уникальный IV (nonce) |
| Ratchet | **Double Ratchet** | Новый ключ на каждое сообщение |
| Аутентификация | **ECDH pub_key** | Вход без пароля, Identity через ключ |

### Double Ratchet подробно

```
ECDH(alice.priv, bob.pub) → sharedSecret (32 байта)
                               │
              ┌────────────────┴────────────────┐
       HKDF("am-chain-A")              HKDF("am-chain-B")
              │                                  │
    alice.sendChain = A            alice.recvChain = B
    bob.sendChain   = B            bob.recvChain   = A
    ↑↑ alice.send == bob.recv — математически гарантировано ↑↑

Каждое сообщение:
  sendChain → HKDF("am-step") → newChain + messageKey
  AES-256-GCM(messageKey, plaintext) → {iv, ct, idx}
  sendChain = newChain  ← старый ключ уничтожается (Forward Secrecy)
```

**Forward Secrecy** — если злоумышленник получил ключ сессии, прошлые сообщения остаются зашифрованными.

---

## Функционал

### Аутентификация
- ✅ Без номера телефона — идентичность через криптографическую пару ключей
- ✅ Создать аккаунт — ECDH P-256 keygen прямо в браузере
- ✅ Войти по приватному ключу (hex 64 символа) — работает на любом устройстве
- ✅ Сессия в localStorage — автовход при повторном открытии
- ✅ Несколько сессий — одновременно две вкладки / два устройства
- ✅ Username: 3–32 символа, только `[a-zA-Z0-9_-]`
- ✅ Отображаемое имя — можно менять в любое время, видят все контакты

### Чат
- ✅ E2EE сообщения через Double Ratchet
- ✅ Статусы: ⏳ отправляется → ✓ доставлено → ✓✓ прочитано
- ✅ Счётчик непрочитанных — сохраняется между сессиями
- ✅ История сообщений — до 200 сообщений на чат, localStorage
- ✅ Показ ciphertext — режим отладки (видно что отправляется в relay)
- ✅ Удаление чата — удаляет сообщения, контакт, сбрасывает Ratchet

### Поиск контактов
- ✅ Поиск по @username — частичное совпадение, включая офлайн пользователей
- ✅ Поиск по pub_key — автодетект (130 hex символов), точное совпадение
- ✅ Через WebSocket (основной) и HTTP API (фоллбек)
- ✅ Отображение онлайн статуса и времени последней активности
- ✅ Офлайн очередь — добавить контакт без сервера, ключ получится при подключении

### P2P WebRTC
- ✅ Прямое соединение через WebRTC DataChannel
- ✅ Диалог согласия у получателя
- ✅ Кнопка отмены исходящего запроса
- ✅ Fallback на relay если P2P недоступен
- ✅ Работает без интернета если оба в одной Wi-Fi сети

### Безопасность
- ✅ Блокировка пользователя — bidirectional (нельзя слать и получать)
- ✅ Ratchet синхронизируется даже при блокировке (нет расхождения при разблокировке)
- ✅ Валидация username на сервере (regex, длина, sanitize)
- ✅ Валидация pub_key (длина 128–132 hex символов)
- ✅ Лимит размера сообщений (256 KB WS, 64 KB payload)
- ✅ Нельзя слать себе сообщения
- ✅ Защита от занятия чужого username (pub_key verif)

### Настройки
- ✅ 5 тем: dark, midnight, navy, slate, light
- ✅ Масштаб интерфейса: 70%–150%
- ✅ Размер шрифта чата: 11–20px
- ✅ Компактный режим
- ✅ Управление серверами без перезапуска
- ✅ Смена имени в профиле

---

## Структура проекта

```
andruha-messenger/
├── server/
│   ├── main.go       — HTTP/WS сервер, Search API, CORS
│   ├── hub.go        — Multi-session роутер сообщений
│   ├── client.go     — WS соединение, протокол, валидация
│   ├── db.go         — JSON хранилище пользователей (без зависимостей)
│   └── go.mod
├── client/
│   ├── electron/
│   │   ├── main.cjs  — Electron main process
│   │   └── preload.cjs
│   ├── src/
│   │   ├── App.jsx   — UI (все экраны)
│   │   ├── crypto.js — ECDH + AES + Double Ratchet (Web Crypto API)
│   │   ├── session.js — localStorage: сессия, контакты, сообщения, ratchet
│   │   ├── ws.js     — WebSocket клиент + multi-session
│   │   └── webrtc.js — WebRTC P2P менеджер
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
├── mobile/
│   ├── src/lib/      — Shared crypto.js и ws.js (идентичны web)
│   └── BUILD_GUIDE.md
├── SECURITY.md
└── README.md
```

---

## Запуск

### Требования
- Go 1.21+
- Node.js 18+

### Терминал 1 — сервер

```bash
cd server
go mod download
go run .
# → ws://localhost:8080/ws
# → http://localhost:8080/api/search?q=alice
# → http://localhost:8080/health
```

### Терминал 2 — веб-клиент

```bash
cd client
npm install
npm run dev
# → http://localhost:5173
```

### Desktop (Electron)

```bash
cd client
npm install

# Dev (Vite + Electron вместе)
npm run electron:dev

# Сборка .exe / .dmg / .AppImage
npm run electron:build
```

---

## Тест на двух компьютерах (локальная сеть)

**Компьютер A (сервер):**
```bash
# Узнать IP
ipconfig           # Windows → IPv4 Address
ip addr show       # Linux → inet

# Запустить
cd server && go run .
cd client && npm run dev
```

**Компьютер B — открыть браузер:**
```
http://192.168.x.x:5173
```

В настройках клиента (⚙️ → Серверы) указать: `ws://192.168.x.x:8080/ws`

**Сценарий:**
```
A: Создать аккаунт @alice
B: Создать аккаунт @bob

A: 🔍 Поиск → @bob → клик → добавлен
B: 🔍 Поиск → @alice → клик → добавлен

A → B: "привет"          (relay, ✓ доставлено)
B: открывает чат         (✓✓ прочитано у Alice)

A: 🔗 P2P → Bob принимает → прямое соединение
A → B: "теперь P2P"      (сервер не участвует)

# Перезапустить браузер A
# Сессия восстановится, контакты и сообщения сохранены
# Ratchet продолжит работу с правильными счётчиками
```

---

## Деплой на VPS

```bash
# Клонируем
git clone https://github.com/YOUR_USERNAME/andruha-messenger
cd andruha-messenger/server

# Запускаем
PORT=8080 go run .
# Или собираем бинарь
go build -o andruha-relay .
./andruha-relay
```

### Nginx + HTTPS (рекомендуется)

```nginx
server {
    listen 443 ssl;
    server_name messenger.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/messenger.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/messenger.yourdomain.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;

    location /ws {
        proxy_pass http://127.0.0.1:8080/ws;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 86400;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:8080;
    }

    location / {
        # Статические файлы клиента
        root /var/www/andruha-messenger/dist;
        try_files $uri $uri/ /index.html;
    }
}
```

```bash
# Собрать клиент
cd client && npm run build
# Скопировать dist/ на сервер в /var/www/andruha-messenger/
```

---

## Протокол WebSocket

### Клиент → Сервер

```json
// Регистрация
{"type":"register","user_id":"alice","pub_key":"04ab...","display_name":"Alice"}

// Поиск (ответ через onSearchResults)
{"type":"search","target":"bob"}

// Запрос ключа
{"type":"get_key","target":"bob"}

// Сообщение (payload зашифрован, сервер не читает)
{"type":"message","to":"bob","payload":{"iv":"a3f...","ct":"8d2...","idx":5}}

// WebRTC signaling
{"type":"webrtc_offer","to":"bob","payload":{"sdp":"..."}}
{"type":"webrtc_answer","to":"bob","payload":{"sdp":"..."}}
{"type":"webrtc_ice","to":"bob","payload":{...candidate...}}
{"type":"webrtc_cancel","to":"bob"}

// Read receipt
{"type":"read_receipt","to":"alice"}

// Смена имени
{"type":"set_name","display_name":"Alice Smith"}
```

### Сервер → Клиент

```json
{"type":"registered","user_id":"alice","users":[...]}
{"type":"pub_key","user_id":"bob","pub_key":"04cd...","display_name":"Bob"}
{"type":"search_results","message":"[{\"user_id\":\"bob\",...}]"}
{"type":"message","from":"alice","payload":{"iv":"...","ct":"...","idx":5}}
{"type":"delivered"}
{"type":"read","user_id":"bob"}
{"type":"online","user_id":"bob","display_name":"Bob"}
{"type":"offline","user_id":"bob"}
{"type":"name_changed","user_id":"bob","display_name":"Bob Smith"}
{"type":"webrtc_offer","from":"bob","payload":{...}}
```

---

## API поиска (HTTP)

```
GET /api/search?q=alice         → поиск по username/имени
GET /api/search?q=@alice        → то же (@  стрипается)
GET /api/search?q=04ab...       → поиск по pub_key (автодетект)
GET /api/user/alice             → конкретный пользователь
GET /health                     → статус сервера
```

---

---

## Что сервер хранит / не хранит

| Хранится | Не хранится |
|----------|-------------|
| user_id | Сообщения |
| pub_key (публичный!) | Приватные ключи |
| display_name | IP адреса |
| last_seen | Метаданные переписки |

Данные хранятся в `data/users.json`. Неактивные пользователи удаляются автоматически через **30 дней**.

---

## Roadmap

- [x] ECDH P-256 + AES-256-GCM E2EE
- [x] WebSocket Relay (Go)
- [x] Double Ratchet (Forward Secrecy)
- [x] WebRTC P2P
- [x] Сессия / вход по ключу
- [x] Поиск (WS + HTTP, офлайн пользователи)
- [x] Несколько сессий одновременно
- [x] Блокировка пользователей
- [x] 5 тем + масштаб + настройки
- [x] Electron desktop
- [ ] Signal Protocol (DH ratchet полный)
- [ ] Android (React Native / Expo)
- [ ] Bluetooth mesh офлайн

---

<div align="center">
MIT License · <a href="./SECURITY.md">Security</a>
</div>

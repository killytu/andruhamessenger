# 🔒 ANDRUHA MESSENGER — Аудит безопасности

## Что защищено

| Угроза | Защита | Статус |
|--------|--------|--------|
| Сервер читает сообщения | ECDH + AES-256-GCM E2EE | ✅ |
| Повтор старого ключа (replay) | Ratchet idx + случайный IV | ✅ |
| Компрометация текущего ключа | Forward Secrecy (Double Ratchet) | ✅ |
| XSS кража ключей из JS | Web Crypto API — ключи non-exportable в памяти | ✅ частично |
| Инъекция через username | Regex `[a-zA-Z0-9_-]`, макс 32 символа | ✅ |
| Невалидный pub_key | Проверка длины 128–132 hex + sanitize | ✅ |
| DoS большими сообщениями | Лимит 256 KB на WS, 64 KB на payload | ✅ |
| Занятие чужого username | Сравнение pub_key при reconnect | ✅ |
| Сообщения от заблокированных | Ratchet продвигается, но сообщение дропается | ✅ |
| Два P2P без согласия | Диалог принятия у получателя | ✅ |
| Трафик в локальной сети | AES-256-GCM шифрует даже relay payload | ✅ |

---

## Известные ограничения

### 🟡 Метаданные трафика
**Что видит сервер:** кто с кем и когда общается (user_id пары, timestamps).  
Содержимое сообщений — нет.  
**Митигация:** P2P режим убирает сервер из цепи полностью.

### 🟡 Приватный ключ в localStorage
**Риск:** XSS атака на том же домене может украсть JWK.  
**Текущая защита:** ключи хранятся как JWK, не как hex в DOM.  
**Митигация:** в Electron — `safeStorage` API; в мобильном — `expo-secure-store`.  
**Полное решение:** использовать `non-extractable` CryptoKey (без `extractable: true`). Тогда JS сам не сможет экспортировать ключ. Но тогда нельзя показать hex в профиле — trade-off.

### 🟡 WebRTC раскрывает IP
**Кому:** только второму участнику P2P соединения, не серверу.  
**Митигация:** браузер использует mDNS для локальных кандидатов (скрывает LAN IP). Публичный IP всё равно виден.  
**Полная митигация:** использовать TURN сервер (трафик через него → IP скрыт, но TURN видит трафик).

### 🟡 STUN через Google/Cloudflare
**Что:** при P2P handshake запросы уходят на `stun.l.google.com`.  
**Риск:** Google видит IP и время.  
**Митигация:** развернуть свой STUN: `apt install coturn`.

### 🟠 Нет TLS по умолчанию (ws:// вместо wss://)
**Риск:** сниффинг трафика в сети (видны зашифрованные блобы, не содержимое).  
**Решение:** Nginx + Let's Encrypt (инструкция в README).

### 🟠 Сессия при session fixation
**Сценарий:** если атакующий знает username жертвы и создаёт аккаунт с тем же именем ДО неё.  
**Текущая защита:** первый занял — его. При reconnect проверяется pub_key.  
**Полное решение:** Challenge-response при регистрации (ECDSA подпись timestamp).

### 🔴 Нет rate limiting
**Риск:** спам регистраций / сообщений с одного IP.  
**Решение:** добавить `golang.org/x/time/rate` — 10 сообщений/сек на соединение.

---

## Что делать для production

```bash
# 1. TLS через nginx (обязательно)
certbot --nginx -d messenger.yourdomain.com

# 2. Ограничить CORS на своём домене (в main.go)
# w.Header().Set("Access-Control-Allow-Origin", "https://messenger.yourdomain.com")

# 3. Свой STUN сервер (опционально)
apt install coturn
# в webrtc.js заменить ICE_SERVERS на свой

# 4. Systemd сервис для автозапуска
cat > /etc/systemd/system/andruha-relay.service << 'SERVICE'
[Unit]
Description=ANDRUHA MESSENGER Relay
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/andruha-messenger/server
ExecStart=/opt/andruha-messenger/server/andruha-relay
Restart=on-failure
Environment=PORT=8080
Environment=DB_PATH=/var/lib/andruha/users.json

[Install]
WantedBy=multi-user.target
SERVICE

systemctl enable andruha-relay
systemctl start andruha-relay
```

---

## Проверка E2EE (как убедиться)

```
1. Включи "🔐 Шифр" в чате
2. Отправь сообщение "привет"
3. Видишь:
   iv: a3f2c1... (случайный nonce, 24 hex символа)
   ct: 8d29f4... (ciphertext — случайные байты)
4. Это ВСЁ что видит relay сервер
5. В логах сервера: [→] alice → bob (47 bytes encrypted)
   Содержимое не логируется
```

---

## Анализ крипто-схемы

```
Атака: перехват трафика + попытка расшифровать

1. Атакующий видит: {from:"alice", to:"bob", payload:{iv:"a3f",ct:"8d2",idx:5}}
2. Для расшифровки нужен messageKey
3. messageKey = HKDF(sendChain_5, "am-step")[32:64]
4. sendChain_5 = HKDF(sendChain_4, "am-step")[0:32]
5. sendChain_0 = HKDF(sharedSecret, "am-chain-A")[0:32]
6. sharedSecret = ECDH(alice.priv, bob.pub)
7. alice.priv никогда не покидает браузер

→ Без alice.priv или bob.priv — расшифровать невозможно даже имея все байты.
→ Даже если alice.priv компрометирован СЕЙЧАС — прошлые сообщения
  защищены (sendChain_N уже уничтожен, Forward Secrecy).
```

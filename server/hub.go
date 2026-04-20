package main

import (
	"log"
	"sync"
)

// Hub — центральный роутер.
// Хранит всех подключённых клиентов и маршрутизирует сообщения.
// Сервер ТУПОЙ RELAY: он не видит содержимое сообщений,
// только направляет зашифрованные байты нужному получателю.
type Hub struct {
	mu sync.RWMutex

	// userID → *Client
	clients map[string]*Client

	// Каналы для регистрации/отключения
	register   chan *Client
	unregister chan *Client

	// Канал входящих конвертов (envelope = кому + что)
	relay chan Envelope
}

type Envelope struct {
	From    string
	To      string
	Payload []byte // уже зашифровано клиентом, сервер не читает
}

func NewHub() *Hub {
	return &Hub{
		clients:    make(map[string]*Client),
		register:   make(chan *Client, 32),
		unregister: make(chan *Client, 32),
		relay:      make(chan Envelope, 256),
	}
}

// Run — главный event loop хаба (один горутин)
func (h *Hub) Run() {
	for {
		select {

		case c := <-h.register:
			h.mu.Lock()
			h.clients[c.UserID] = c
			h.mu.Unlock()
			log.Printf("[+] %s connected (total: %d)", c.UserID, h.Count())

			// Уведомить онлайн-пользователей что он появился
			h.broadcastPresence(c.UserID, true)

		case c := <-h.unregister:
			h.mu.Lock()
			if existing, ok := h.clients[c.UserID]; ok && existing == c {
				delete(h.clients, c.UserID)
				close(c.send)
			}
			h.mu.Unlock()
			log.Printf("[-] %s disconnected (total: %d)", c.UserID, h.Count())

			// Уведомить что ушёл
			h.broadcastPresence(c.UserID, false)

		case env := <-h.relay:
			h.mu.RLock()
			recipient, ok := h.clients[env.To]
			h.mu.RUnlock()

			if ok {
				select {
				case recipient.send <- env.Payload:
					log.Printf("[→] %s → %s (%d bytes encrypted)", env.From, env.To, len(env.Payload))
				default:
					// Буфер получателя переполнен — отключаем
					log.Printf("[!] Buffer overflow for %s, disconnecting", env.To)
					h.unregister <- recipient
				}
			} else {
				// Получатель офлайн — в MVP просто дропаем
				// В следующем этапе: offline queue / push
				log.Printf("[?] %s not found (offline), message from %s dropped", env.To, env.From)
			}
		}
	}
}

func (h *Hub) Count() int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.clients)
}

// GetPubKey — вернуть публичный ключ пользователя (для key exchange)
func (h *Hub) GetPubKey(userID string) (string, bool) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	if c, ok := h.clients[userID]; ok {
		return c.PubKey, true
	}
	return "", false
}

// GetOnlineUsers — список онлайн пользователей (кроме себя)
func (h *Hub) GetOnlineUsers(exceptID string) []UserInfo {
	h.mu.RLock()
	defer h.mu.RUnlock()
	var users []UserInfo
	for id, c := range h.clients {
		if id != exceptID {
			users = append(users, UserInfo{UserID: id, PubKey: c.PubKey})
		}
	}
	return users
}

// broadcastPresence — оповестить всех об изменении статуса пользователя
func (h *Hub) broadcastPresence(userID string, online bool) {
	evtType := "online"
	if !online {
		evtType = "offline"
	}

	msg := mustMarshal(ServerMsg{
		Type:   evtType,
		UserID: userID,
	})

	h.mu.RLock()
	defer h.mu.RUnlock()
	for id, c := range h.clients {
		if id != userID {
			select {
			case c.send <- msg:
			default:
			}
		}
	}
}

type UserInfo struct {
	UserID string `json:"user_id"`
	PubKey string `json:"pub_key"`
}

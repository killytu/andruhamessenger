package main

import (
	"log"
	"sync"
)

type Hub struct {
	mu         sync.RWMutex
	// clientMap: userID → список активных соединений (вкладки, устройства)
	clientMap  map[string][]*Client
	register   chan *Client
	unregister chan *Client
	relay      chan Envelope
	db         *UserDB
}

type Envelope struct {
	From    string
	To      string
	Payload []byte
}

func NewHub(db *UserDB) *Hub {
	return &Hub{
		clientMap:  make(map[string][]*Client),
		register:   make(chan *Client, 32),
		unregister: make(chan *Client, 32),
		relay:      make(chan Envelope, 512),
		db:         db,
	}
}

func (h *Hub) Run() {
	for {
		select {
		case c := <-h.register:
			h.mu.Lock()
			h.clientMap[c.UserID] = append(h.clientMap[c.UserID], c)
			h.mu.Unlock()
			sessions := h.sessionCount(c.UserID)
			log.Printf("[+] %s (%q) connected (sessions: %d, online users: %d)", c.UserID, c.DisplayName, sessions, h.Count())
			if h.db != nil {
				h.db.Upsert(c.UserID, c.PubKey, c.DisplayName)
			}
			// Присутствие broadcast только для первой сессии
			if sessions == 1 {
				h.broadcastPresence(c.UserID, c.DisplayName, true)
			}

		case c := <-h.unregister:
			h.mu.Lock()
			if list, ok := h.clientMap[c.UserID]; ok {
				newList := make([]*Client, 0, len(list))
				for _, cl := range list {
					if cl == c {
						close(cl.send)
					} else {
						newList = append(newList, cl)
					}
				}
				if len(newList) == 0 {
					delete(h.clientMap, c.UserID)
				} else {
					h.clientMap[c.UserID] = newList
				}
			}
			remaining := h.sessionCount(c.UserID)
			h.mu.Unlock()
			log.Printf("[-] %s disconnected (sessions left: %d)", c.UserID, remaining)
			if h.db != nil {
				h.db.UpdateLastSeen(c.UserID)
			}
			// Offline broadcast только когда закрыта последняя сессия
			if remaining == 0 {
				h.broadcastPresence(c.UserID, c.DisplayName, false)
			}

		case env := <-h.relay:
			h.mu.RLock()
			recipients := h.clientMap[env.To]
			h.mu.RUnlock()
			for _, recipient := range recipients {
				select {
				case recipient.send <- env.Payload:
				default:
					log.Printf("[!] buffer overflow for %s", env.To)
					go func(r *Client) { h.unregister <- r }(recipient)
				}
			}
		}
	}
}

func (h *Hub) Count() int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.clientMap) // уникальных пользователей
}

func (h *Hub) sessionCount(userID string) int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.clientMap[userID])
}

// kickUser — принудительно отключает старое соединение пользователя
// Используется при переподключении с тем же pub_key (session resume)
// kickUser больше не используется, но оставлен для совместимости
func (h *Hub) kickUser(userID string) {
	h.mu.RLock()
	list := h.clientMap[userID]
	h.mu.RUnlock()
	for _, cl := range list {
		go func(c *Client) { h.unregister <- c }(cl)
	}
}

func (h *Hub) IsOnline(userID string) bool {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.clientMap[userID]) > 0
}

func (h *Hub) GetUserInfo(userID string) (pubKey, displayName string, ok bool) {
	// Сначала проверяем онлайн-клиентов
	h.mu.RLock()
	list := h.clientMap[userID]
	h.mu.RUnlock()
	if len(list) > 0 {
		return list[0].PubKey, list[0].DisplayName, true
	}
	// Потом БД (офлайн пользователи)
	if h.db != nil {
		usr, err := h.db.GetByID(userID)
		if err == nil && usr != nil {
			return usr.PubKey, usr.DisplayName, true
		}
	}
	return "", "", false
}

func (h *Hub) GetPubKey(userID string) (string, bool) {
	pk, _, ok := h.GetUserInfo(userID)
	return pk, ok
}

func (h *Hub) GetOnlineUsers(exceptID string) []UserInfo {
	h.mu.RLock()
	defer h.mu.RUnlock()
	var users []UserInfo
	for id, list := range h.clientMap {
		if id != exceptID && len(list) > 0 {
			users = append(users, UserInfo{UserID: id, PubKey: list[0].PubKey, DisplayName: list[0].DisplayName})
		}
	}
	return users
}

func (h *Hub) broadcastPresence(userID, displayName string, online bool) {
	evtType := "online"
	if !online {
		evtType = "offline"
	}
	msg := mustMarshal(ServerMsg{Type: evtType, UserID: userID, DisplayName: displayName})
	h.mu.RLock()
	defer h.mu.RUnlock()
	for id, list := range h.clientMap {
		if id != userID {
			for _, cl := range list {
				select {
				case cl.send <- msg:
				default:
				}
			}
		}
	}
}

func (h *Hub) broadcastNameChange(userID, displayName string) {
	if h.db != nil {
		h.db.UpdateDisplayName(userID, displayName)
	}
	msg := mustMarshal(ServerMsg{Type: "name_changed", UserID: userID, DisplayName: displayName})
	h.mu.RLock()
	defer h.mu.RUnlock()
	for id, list := range h.clientMap {
		if id != userID {
			for _, cl := range list {
				select {
				case cl.send <- msg:
				default:
				}
			}
		}
	}
}

type UserInfo struct {
	UserID      string `json:"user_id"`
	PubKey      string `json:"pub_key"`
	DisplayName string `json:"display_name"`
}

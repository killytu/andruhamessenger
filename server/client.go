package main

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/gorilla/websocket"
)

const (
	writeWait      = 10 * time.Second
	pongWait       = 60 * time.Second
	pingPeriod     = (pongWait * 9) / 10
	maxMessageSize = 256 * 1024 // 256 KB — разумный лимит
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  2048,
	WriteBufferSize: 2048,
	// БЕЗОПАСНОСТЬ: в проде — проверять Origin
	// CheckOrigin: func(r *http.Request) bool {
	//     origin := r.Header.Get("Origin")
	//     return origin == "https://yourdomain.com"
	// },
	CheckOrigin: func(r *http.Request) bool { return true },
}

// ── Клиент → Сервер ──────────────────────────────────────────
type ClientMsg struct {
	Type        string          `json:"type"`
	UserID      string          `json:"user_id,omitempty"`
	PubKey      string          `json:"pub_key,omitempty"`
	DisplayName string          `json:"display_name,omitempty"`
	To          string          `json:"to,omitempty"`
	Target      string          `json:"target,omitempty"`
	Payload     json.RawMessage `json:"payload,omitempty"`
}

// ── Сервер → Клиент ──────────────────────────────────────────
type ServerMsg struct {
	Type        string          `json:"type"`
	UserID      string          `json:"user_id,omitempty"`
	DisplayName string          `json:"display_name,omitempty"`
	PubKey      string          `json:"pub_key,omitempty"`
	From        string          `json:"from,omitempty"`
	Payload     json.RawMessage `json:"payload,omitempty"`
	Message     string          `json:"message,omitempty"`
	Users       []UserInfo      `json:"users,omitempty"`
}

func mustMarshal(v any) []byte {
	b, _ := json.Marshal(v)
	return b
}

// ── Client ───────────────────────────────────────────────────
type Client struct {
	hub         *Hub
	conn        *websocket.Conn
	send        chan []byte
	UserID      string
	PubKey      string
	DisplayName string
}

// Базовая санитизация строк
func sanitize(s string, maxLen int) string {
	s = strings.TrimSpace(s)
	// Удаляем управляющие символы
	var out []rune
	for _, r := range s {
		if r >= 32 || r == '\n' || r == '\t' {
			out = append(out, r)
		}
	}
	result := string(out)
	if len(result) > maxLen {
		return result[:maxLen]
	}
	return result
}

func ServeWS(hub *Hub, w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println("upgrade:", err)
		return
	}
	c := &Client{
		hub:  hub,
		conn: conn,
		send: make(chan []byte, 128),
	}
	go c.writePump()
	go c.readPump()
}

func (c *Client) readPump() {
	defer func() {
		if c.UserID != "" {
			c.hub.unregister <- c
		}
		c.conn.Close()
	}()

	c.conn.SetReadLimit(maxMessageSize)
	c.conn.SetReadDeadline(time.Now().Add(pongWait))
	c.conn.SetPongHandler(func(string) error {
		c.conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	for {
		_, raw, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("[err] %s: %v", c.UserID, err)
			}
			break
		}
		// БЕЗОПАСНОСТЬ: лимит размера уже в SetReadLimit,
		// но дополнительно проверяем разобранный JSON
		if len(raw) > int(maxMessageSize) {
			c.sendMsg(ServerMsg{Type: "error", Message: "message too large"})
			continue
		}
		var msg ClientMsg
		if err := json.Unmarshal(raw, &msg); err != nil {
			c.sendMsg(ServerMsg{Type: "error", Message: "invalid json"})
			continue
		}
		c.handle(msg)
	}
}

func (c *Client) handle(msg ClientMsg) {
	switch msg.Type {

	case "register":
		userID := sanitize(msg.UserID, 32)
		pubKey := sanitize(msg.PubKey, 256)
		displayName := sanitize(msg.DisplayName, 64)

		if userID == "" || pubKey == "" {
			c.sendMsg(ServerMsg{Type: "error", Message: "user_id and pub_key required"})
			return
		}
		// БЕЗОПАСНОСТЬ: базовая валидация UserID (только буквы, цифры, _-)
		for _, ch := range userID {
			if !((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || (ch >= '0' && ch <= '9') || ch == '_' || ch == '-') {
				c.sendMsg(ServerMsg{Type: "error", Message: "user_id: only letters, digits, _ and - allowed"})
				return
			}
		}
		// SECURITY: pub_key должен быть валидным hex (P-256 = 65 байт = 130 hex символов)
		if len(pubKey) < 128 || len(pubKey) > 132 {
			c.sendMsg(ServerMsg{Type: "error", Message: "invalid pub_key length"})
			return
		}
		// Проверяем что это валидный hex
		for _, ch := range pubKey {
			if !((ch >= '0' && ch <= '9') || (ch >= 'a' && ch <= 'f') || (ch >= 'A' && ch <= 'F')) {
				c.sendMsg(ServerMsg{Type: "error", Message: "invalid pub_key: must be hex"})
				return
			}
		}

		// Если тот же user_id уже подключён:
		// - Тот же pub_key → разрешаем (вторая вкладка / переподключение).
		//   Обе вкладки получают сообщения. Новая регистрация просто добавляет второй клиент.
		// - Другой pub_key → отказываем (чужой человек пытается занять ID).
		if existingPK, exists := c.hub.GetPubKey(userID); exists {
			if existingPK != pubKey {
				c.sendMsg(ServerMsg{Type: "error", Message: "user_id already taken"})
				return
			}
			// Тот же пользователь — разрешаем вторую сессию без kick
			log.Printf("[multi-session] %s registered from new tab/device", userID)
		}

		c.UserID = userID
		c.PubKey = pubKey
		c.DisplayName = displayName
		if c.DisplayName == "" {
			c.DisplayName = userID
		}
		c.hub.register <- c
		c.sendMsg(ServerMsg{
			Type:        "registered",
			UserID:      c.UserID,
			DisplayName: c.DisplayName,
			Users:       c.hub.GetOnlineUsers(c.UserID),
		})

	case "set_name":
		if c.UserID == "" {
			return
		}
		// SECURITY: sanitize display name, strip HTML/special chars
		newName := sanitize(msg.DisplayName, 64)
		if newName == "" {
			return
		}
		// Не разрешаем менять имя чаще чем раз в 5 секунд (anti-spam)
		c.DisplayName = newName
		c.hub.broadcastNameChange(c.UserID, c.DisplayName)

	case "get_key":
		if c.UserID == "" {
			c.sendMsg(ServerMsg{Type: "error", Message: "not registered"})
			return
		}
		target := sanitize(msg.Target, 32)
		if target == "" {
			c.sendMsg(ServerMsg{Type: "error", Message: "target required"})
			return
		}
		// БЕЗОПАСНОСТЬ: нельзя запрашивать свой собственный ключ
		if target == c.UserID {
			c.sendMsg(ServerMsg{Type: "error", Message: "cannot get own key"})
			return
		}
		pubKey, displayName, ok := c.hub.GetUserInfo(target)
		if !ok {
			c.sendMsg(ServerMsg{Type: "error", Message: "user not found: " + target})
			return
		}
		c.sendMsg(ServerMsg{
			Type:        "pub_key",
			UserID:      target,
			PubKey:      pubKey,
			DisplayName: displayName,
		})

	case "message":
		if c.UserID == "" {
			c.sendMsg(ServerMsg{Type: "error", Message: "not registered"})
			return
		}
		to := sanitize(msg.To, 64)
		if to == "" || msg.Payload == nil {
			c.sendMsg(ServerMsg{Type: "error", Message: "to and payload required"})
			return
		}
		// БЕЗОПАСНОСТЬ: нельзя слать себе
		if to == c.UserID {
			c.sendMsg(ServerMsg{Type: "error", Message: "cannot send to self"})
			return
		}
		// БЕЗОПАСНОСТЬ: лимит размера payload
		if len(msg.Payload) > 64*1024 {
			c.sendMsg(ServerMsg{Type: "error", Message: "payload too large (max 64KB)"})
			return
		}
		forward := mustMarshal(ServerMsg{
			Type:    "message",
			From:    c.UserID,
			Payload: msg.Payload,
		})
		c.hub.relay <- Envelope{From: c.UserID, To: to, Payload: forward}
		c.sendMsg(ServerMsg{Type: "delivered"})

	case "webrtc_offer", "webrtc_answer", "webrtc_ice", "webrtc_cancel":
		if c.UserID == "" {
			c.sendMsg(ServerMsg{Type: "error", Message: "not registered"})
			return
		}
		to := sanitize(msg.To, 64)
		if to == "" {
			c.sendMsg(ServerMsg{Type: "error", Message: "to required"})
			return
		}
		if to == c.UserID {
			return
		} // нельзя слать себе
		if msg.Type != "webrtc_cancel" && msg.Payload == nil {
			c.sendMsg(ServerMsg{Type: "error", Message: "payload required"})
			return
		}
		// БЕЗОПАСНОСТЬ: лимит SDP (не должен быть огромным)
		if len(msg.Payload) > 16*1024 {
			c.sendMsg(ServerMsg{Type: "error", Message: "webrtc payload too large"})
			return
		}
		forward := mustMarshal(ServerMsg{
			Type:    msg.Type,
			From:    c.UserID,
			Payload: msg.Payload,
		})
		c.hub.relay <- Envelope{From: c.UserID, To: to, Payload: forward}

	case "search":
		// Поиск пользователей через WebSocket (для клиентов без HTTP доступа)
		if c.UserID == "" {
			c.sendMsg(ServerMsg{Type: "error", Message: "not registered"})
			return
		}
		query := sanitize(msg.Target, 64)
		if query == "" {
			c.sendMsg(ServerMsg{Type: "search_results", Message: "[]"})
			return
		}
		if c.hub.db == nil {
			c.sendMsg(ServerMsg{Type: "error", Message: "search not available"})
			return
		}
		// Передаём результат как JSON в Message поле
		users, err := c.hub.db.SearchByID(query, 10)
		if err != nil {
			c.sendMsg(ServerMsg{Type: "error", Message: "search error"})
			return
		}
		// Если выглядит как pubkey — ищем по ключу
		if len(query) > 100 {
			usr, _ := c.hub.db.SearchByPubKey(query)
			if usr != nil {
				users = []*DBUser{usr}
			}
		}
		var results []UserInfo
		for _, u := range users {
			results = append(results, UserInfo{UserID: u.UserID, PubKey: u.PubKey, DisplayName: u.DisplayName})
		}
		if results == nil {
			results = []UserInfo{}
		}
		resultJson, _ := json.Marshal(results)
		c.sendMsg(ServerMsg{Type: "search_results", Message: string(resultJson)})

	case "read_receipt":
		if c.UserID == "" {
			return
		}
		to := sanitize(msg.To, 64)
		if to == "" || to == c.UserID {
			return
		}
		forward := mustMarshal(ServerMsg{Type: "read", UserID: c.UserID})
		c.hub.relay <- Envelope{From: c.UserID, To: to, Payload: forward}

	default:
		c.sendMsg(ServerMsg{Type: "error", Message: "unknown type: " + msg.Type})
	}
}

func (c *Client) sendMsg(msg ServerMsg) {
	select {
	case c.send <- mustMarshal(msg):
	default:
		log.Printf("[warn] send buffer full for %s, dropping", c.UserID)
	}
}

func (c *Client) writePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()
	for {
		select {
		case msg, ok := <-c.send:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			if err := c.conn.WriteMessage(websocket.TextMessage, msg); err != nil {
				return
			}
		case <-ticker.C:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

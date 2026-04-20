package main

import (
	"encoding/json"
	"log"
	"net/http"
	"time"

	"github.com/gorilla/websocket"
)

const (
	writeWait      = 10 * time.Second
	pongWait       = 60 * time.Second
	pingPeriod     = (pongWait * 9) / 10
	maxMessageSize = 512 * 1024 // 512 KB
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	// В проде — проверять Origin!
	CheckOrigin: func(r *http.Request) bool { return true },
}

// ─── Протокол (клиент → сервер) ───────────────────────────────

type ClientMsg struct {
	Type string `json:"type"`

	// register
	UserID string `json:"user_id,omitempty"`
	PubKey string `json:"pub_key,omitempty"`

	// message
	To      string          `json:"to,omitempty"`
	Payload json.RawMessage `json:"payload,omitempty"`

	// get_key / get_online
	Target string `json:"target,omitempty"`

	// read_receipt
	To string `json:"to,omitempty"`
}

// ─── Протокол (сервер → клиент) ───────────────────────────────

type ServerMsg struct {
	Type string `json:"type"`

	// registered / online / offline
	UserID string `json:"user_id,omitempty"`
	PubKey string `json:"pub_key,omitempty"`

	// message forward
	From    string          `json:"from,omitempty"`
	Payload json.RawMessage `json:"payload,omitempty"`

	// error
	Message string `json:"message,omitempty"`

	// online_users
	Users []UserInfo `json:"users,omitempty"`
}

func mustMarshal(v any) []byte {
	b, _ := json.Marshal(v)
	return b
}

// ─── Client ───────────────────────────────────────────────────

type Client struct {
	hub    *Hub
	conn   *websocket.Conn
	send   chan []byte
	UserID string
	PubKey string
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

// readPump — читаем сообщения от клиента
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

		var msg ClientMsg
		if err := json.Unmarshal(raw, &msg); err != nil {
			c.sendMsg(ServerMsg{Type: "error", Message: "invalid json"})
			continue
		}

		c.handle(msg)
	}
}

// handle — роутер входящих сообщений
func (c *Client) handle(msg ClientMsg) {
	switch msg.Type {

	// ── Регистрация ──────────────────────────────────────────
	case "register":
		if msg.UserID == "" || msg.PubKey == "" {
			c.sendMsg(ServerMsg{Type: "error", Message: "user_id and pub_key required"})
			return
		}

		// Проверяем, не занято ли имя
		if _, exists := c.hub.GetPubKey(msg.UserID); exists {
			c.sendMsg(ServerMsg{Type: "error", Message: "user_id already taken"})
			return
		}

		c.UserID = msg.UserID
		c.PubKey = msg.PubKey
		c.hub.register <- c

		// Подтверждение + список онлайн пользователей
		c.sendMsg(ServerMsg{
			Type:   "registered",
			UserID: c.UserID,
			Users:  c.hub.GetOnlineUsers(c.UserID),
		})

	// ── Получить публичный ключ другого пользователя ─────────
	case "get_key":
		if msg.Target == "" {
			c.sendMsg(ServerMsg{Type: "error", Message: "target required"})
			return
		}
		pubKey, ok := c.hub.GetPubKey(msg.Target)
		if !ok {
			c.sendMsg(ServerMsg{Type: "error", Message: "user not found: " + msg.Target})
			return
		}
		c.sendMsg(ServerMsg{
			Type:   "pub_key",
			UserID: msg.Target,
			PubKey: pubKey,
		})

	// ── Отправить зашифрованное сообщение ────────────────────
	case "message":
		if c.UserID == "" {
			c.sendMsg(ServerMsg{Type: "error", Message: "not registered"})
			return
		}
		if msg.To == "" || msg.Payload == nil {
			c.sendMsg(ServerMsg{Type: "error", Message: "to and payload required"})
			return
		}
		forward := mustMarshal(ServerMsg{
			Type:    "message",
			From:    c.UserID,
			Payload: msg.Payload,
		})
		c.hub.relay <- Envelope{From: c.UserID, To: msg.To, Payload: forward}
		c.sendMsg(ServerMsg{Type: "delivered"})

	// ── WebRTC Signaling — сервер просто relay, не читает SDP ─
	// offer: инициатор отправляет SDP offer
	// answer: получатель отвечает SDP answer
	// ice: обмен ICE candidates (для NAT traversal)
	case "webrtc_offer", "webrtc_answer", "webrtc_ice":
		if c.UserID == "" {
			c.sendMsg(ServerMsg{Type: "error", Message: "not registered"})
			return
		}
		if msg.To == "" || msg.Payload == nil {
			c.sendMsg(ServerMsg{Type: "error", Message: "to and payload required"})
			return
		}
		// Пробрасываем as-is, только добавляем from
		forward := mustMarshal(ServerMsg{
			Type:    msg.Type,
			From:    c.UserID,
			Payload: msg.Payload,
		})
		c.hub.relay <- Envelope{From: c.UserID, To: msg.To, Payload: forward}
		log.Printf("[WebRTC] %s --%s--> %s", c.UserID, msg.Type, msg.To)

	// Уведомление о прочтении — пересылаем отправителю
	case "read_receipt":
		if c.UserID == "" || msg.To == "" {
			return
		}
		forward := mustMarshal(ServerMsg{Type: "read", UserID: c.UserID})
		c.hub.relay <- Envelope{From: c.UserID, To: msg.To, Payload: forward}

	default:
		c.sendMsg(ServerMsg{Type: "error", Message: "unknown type: " + msg.Type})
	}
}

func (c *Client) sendMsg(msg ServerMsg) {
	c.send <- mustMarshal(msg)
}

// writePump — пишем в WebSocket из канала send
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

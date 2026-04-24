package main

// db.go — хранилище пользователей на JSON-файле.
// Никаких внешних зависимостей — только стандартная библиотека.
// Безопасность: хранит только публичные данные (user_id, pub_key, display_name, last_seen).
// Сообщения НЕ хранятся никогда.

import (
	"encoding/json"
	"log"
	"os"
	"strings"
	"sync"
	"time"
)

type DBUser struct {
	UserID      string    `json:"user_id"`
	PubKey      string    `json:"pub_key"`
	DisplayName string    `json:"display_name"`
	LastSeen    time.Time `json:"last_seen"`
}

type UserDB struct {
	mu      sync.RWMutex
	users   map[string]*DBUser // userID → user
	path    string
	dirty   bool
}

func NewUserDB(path string) (*UserDB, error) {
	db := &UserDB{
		users: make(map[string]*DBUser),
		path:  path,
	}
	if err := db.load(); err != nil && !os.IsNotExist(err) {
		log.Printf("[DB] warning: could not load %s: %v", path, err)
	}
	go db.flushLoop()
	go db.cleanupLoop()
	return db, nil
}

func (db *UserDB) load() error {
	data, err := os.ReadFile(db.path)
	if err != nil {
		return err
	}
	var list []*DBUser
	if err := json.Unmarshal(data, &list); err != nil {
		return err
	}
	db.mu.Lock()
	defer db.mu.Unlock()
	for _, u := range list {
		db.users[u.UserID] = u
	}
	log.Printf("[DB] loaded %d users from %s", len(db.users), db.path)
	return nil
}

func (db *UserDB) flush() {
	db.mu.RLock()
	list := make([]*DBUser, 0, len(db.users))
	for _, u := range db.users {
		list = append(list, u)
	}
	db.mu.RUnlock()

	data, err := json.MarshalIndent(list, "", "  ")
	if err != nil {
		log.Printf("[DB] marshal error: %v", err)
		return
	}
	// Атомарная запись через временный файл
	tmp := db.path + ".tmp"
	if err := os.WriteFile(tmp, data, 0600); err != nil {
		log.Printf("[DB] write error: %v", err)
		return
	}
	if err := os.Rename(tmp, db.path); err != nil {
		log.Printf("[DB] rename error: %v", err)
	}
}

// flushLoop — сохраняем на диск раз в минуту если были изменения
func (db *UserDB) flushLoop() {
	t := time.NewTicker(60 * time.Second)
	defer t.Stop()
	for range t.C {
		db.mu.RLock()
		dirty := db.dirty
		db.mu.RUnlock()
		if dirty {
			db.flush()
			db.mu.Lock()
			db.dirty = false
			db.mu.Unlock()
		}
	}
}

// cleanupLoop — удаляем неактивных пользователей (30 дней)
func (db *UserDB) cleanupLoop() {
	t := time.NewTicker(24 * time.Hour)
	defer t.Stop()
	db.cleanup() // при старте
	for range t.C {
		db.cleanup()
	}
}

func (db *UserDB) cleanup() {
	cutoff := time.Now().AddDate(0, 0, -30)
	db.mu.Lock()
	n := 0
	for id, u := range db.users {
		if u.LastSeen.Before(cutoff) {
			delete(db.users, id)
			n++
		}
	}
	if n > 0 {
		db.dirty = true
		log.Printf("[DB] removed %d inactive users (>30 days)", n)
	}
	db.mu.Unlock()
	if n > 0 {
		db.flush()
	}
}

func (db *UserDB) Upsert(userID, pubKey, displayName string) error {
	db.mu.Lock()
	defer db.mu.Unlock()
	existing := db.users[userID]
	if existing == nil {
		existing = &DBUser{UserID: userID}
	}
	existing.PubKey      = pubKey
	existing.DisplayName = displayName
	existing.LastSeen    = time.Now()
	db.users[userID] = existing
	db.dirty = true
	return nil
}

func (db *UserDB) UpdateLastSeen(userID string) {
	db.mu.Lock()
	if u, ok := db.users[userID]; ok {
		u.LastSeen = time.Now()
		db.dirty = true
	}
	db.mu.Unlock()
}

func (db *UserDB) UpdateDisplayName(userID, displayName string) {
	db.mu.Lock()
	if u, ok := db.users[userID]; ok {
		u.DisplayName = displayName
		db.dirty = true
	}
	db.mu.Unlock()
}

// SearchByID — поиск по user_id или display_name (частичное совпадение)
func (db *UserDB) SearchByID(query string, limit int) ([]*DBUser, error) {
	q := strings.ToLower(strings.TrimSpace(query))
	if q == "" {
		return nil, nil
	}
	if limit <= 0 || limit > 20 {
		limit = 10
	}
	db.mu.RLock()
	defer db.mu.RUnlock()
	var out []*DBUser
	for _, u := range db.users {
		if strings.Contains(strings.ToLower(u.UserID), q) ||
			strings.Contains(strings.ToLower(u.DisplayName), q) {
			out = append(out, u)
			if len(out) >= limit {
				break
			}
		}
	}
	return out, nil
}

// SearchByPubKey — точное совпадение публичного ключа
func (db *UserDB) SearchByPubKey(pubKey string) (*DBUser, error) {
	pk := strings.TrimSpace(pubKey)
	db.mu.RLock()
	defer db.mu.RUnlock()
	for _, u := range db.users {
		if u.PubKey == pk {
			return u, nil
		}
	}
	return nil, nil
}

func (db *UserDB) GetByID(userID string) (*DBUser, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()
	u := db.users[userID]
	return u, nil
}

func (db *UserDB) Count() int {
	db.mu.RLock()
	defer db.mu.RUnlock()
	return len(db.users)
}

func (db *UserDB) Close() {
	db.flush()
}

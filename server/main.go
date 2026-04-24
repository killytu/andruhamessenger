package main

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"regexp"
	"strings"
	"time"
)

var hexRe = regexp.MustCompile(`^[0-9a-fA-F]{128,132}$`)

func isPubKey(s string) bool {
	return hexRe.MatchString(strings.TrimSpace(s))
}

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	dbPath := os.Getenv("DB_PATH")
	if dbPath == "" {
		if err := os.MkdirAll("./data", 0700); err != nil {
			log.Printf("[warn] cannot create data dir: %v", err)
		}
		dbPath = "./data/users.json"
	}

	userDB, err := NewUserDB(dbPath)
	if err != nil {
		log.Fatal("DB init failed:", err)
	}
	defer userDB.Close()
	log.Printf("[DB] %s (%d users)", dbPath, userDB.Count())

	hub := NewHub(userDB)
	go hub.Run()

	mux := http.NewServeMux()

	// ── WebSocket ──────────────────────────────────────────────
	mux.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		ServeWS(hub, w, r)
	})

	// ── Search API ─────────────────────────────────────────────
	// GET /api/search?q=alice     → поиск по ID/имени (все зарегистрированные)
	// GET /api/search?q=04ab...   → поиск по pub_key (автодетект)
	mux.HandleFunc("/api/search", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "GET" {
			http.Error(w, "method not allowed", 405)
			return
		}
		q := strings.TrimSpace(r.URL.Query().Get("q"))
		// Убираем @ если пользователь передал @alice
		q = strings.TrimPrefix(q, "@")
		q = strings.TrimSpace(q)

		if q == "" {
			jsonResp(w, map[string]any{"users": []any{}, "query": ""})
			return
		}

		var out []map[string]any

		if isPubKey(q) {
			u, _ := userDB.SearchByPubKey(q)
			if u != nil {
				out = append(out, dbUserToMap(u, hub.IsOnline(u.UserID)))
			}
		} else {
			users, _ := userDB.SearchByID(q, 10)
			for _, u := range users {
				out = append(out, dbUserToMap(u, hub.IsOnline(u.UserID)))
			}
		}
		if out == nil {
			out = []map[string]any{}
		}
		jsonResp(w, map[string]any{"users": out, "query": q})
	})

	// ── User by ID ─────────────────────────────────────────────
	mux.HandleFunc("/api/user/", func(w http.ResponseWriter, r *http.Request) {
		id := strings.TrimPrefix(r.URL.Path, "/api/user/")
		id = strings.TrimPrefix(strings.TrimSpace(id), "@")
		if id == "" {
			http.Error(w, `{"error":"user_id required"}`, 400)
			return
		}
		u, _ := userDB.GetByID(id)
		if u == nil {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(404)
			w.Write([]byte(`{"error":"not found"}`))
			return
		}
		jsonResp(w, dbUserToMap(u, hub.IsOnline(u.UserID)))
	})

	// ── Health ─────────────────────────────────────────────────
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		jsonResp(w, map[string]any{
			"status":           "ok",
			"service":          "andruha-messenger-relay",
			"clients_online":   hub.Count(),
			"users_registered": userDB.Count(),
			"timestamp":        time.Now().UTC().Format(time.RFC3339),
		})
	})

	// ── Info ───────────────────────────────────────────────────
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/" {
			http.NotFound(w, r)
			return
		}
		jsonResp(w, map[string]string{
			"name":    "ANDRUHA MESSENGER Relay",
			"version": "1.0.0",
			"ws":      "ws://<host>:" + port + "/ws",
			"health":  "http://<host>:" + port + "/health",
			"search":  "http://<host>:" + port + "/api/search?q=username",
		})
	})

	handler := corsMiddleware(loggingMiddleware(mux))

	log.Printf("🚀 ANDRUHA MESSENGER Relay v1.0.0")
	log.Printf("📡 ws://0.0.0.0:%s/ws", port)
	log.Printf("❤️  http://0.0.0.0:%s/health", port)
	log.Printf("🔍 http://0.0.0.0:%s/api/search?q=", port)

	srv := &http.Server{
		Addr:         ":" + port,
		Handler:      handler,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}
	if err := srv.ListenAndServe(); err != nil {
		log.Fatal(err)
	}
}

func dbUserToMap(u *DBUser, online bool) map[string]any {
	return map[string]any{
		"user_id":      u.UserID,
		"pub_key":      u.PubKey,
		"display_name": u.DisplayName,
		"online":       online,
		"last_seen":    u.LastSeen.Unix(),
	}
}

func jsonResp(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(v)
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// БЕЗОПАСНОСТЬ: в продакшне ограничить Origin до своего домена
		// w.Header().Set("Access-Control-Allow-Origin", "https://yourdomain.com")
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == "OPTIONS" {
			w.WriteHeader(204)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func loggingMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		skip := r.URL.Path == "/health" || r.URL.Path == "/ws"
		if !skip {
			log.Printf("[HTTP] %s %s", r.Method, r.URL.Path)
		}
		next.ServeHTTP(w, r)
	})
}

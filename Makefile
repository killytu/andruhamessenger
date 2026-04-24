.PHONY: dev server client electron electron-build push

# ── Dev (два терминала) ─────────────────────────────────────
dev:
	@echo "Запускай в двух терминалах:"
	@echo "  make server"
	@echo "  make client"

server:
	@echo "🚀 ANDRUHA MESSENGER Relay → ws://localhost:8080/ws"
	cd server && go run .

client:
	@echo "🌐 Web UI → http://localhost:5173"
	cd client && npm install && npm run dev

# ── Electron ────────────────────────────────────────────────
electron:
	cd client && npm install && npm run electron:dev

electron-build:
	cd client && npm run electron:build

# ── Go ──────────────────────────────────────────────────────
go-build:
	cd server && CGO_ENABLED=0 go build -o andruha-relay .

go-tidy:
	cd server && go mod tidy

# ── GitHub ──────────────────────────────────────────────────
push:
	git add .
	git commit -m "update"
	git push

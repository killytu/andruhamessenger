.PHONY: dev server client docker-up docker-down logs electron

# ── Dev (без Docker) ──────────────────────────────────────────
dev:
	@make -j2 server client

server:
	@echo "🚀 Go relay → ws://localhost:8080/ws"
	cd server && go run .

client:
	@echo "🌐 React → http://localhost:5173"
	cd client && npm install && npm run dev

# ── Electron ──────────────────────────────────────────────────
electron:
	@echo "🖥  Electron desktop app..."
	cd client && npm install && npm run electron:dev

electron-build:
	@echo "📦 Building Electron app..."
	cd client && npm run electron:build

# ── Docker ────────────────────────────────────────────────────
docker-up:
	docker-compose up --build -d
	@echo "✅ Client:  http://localhost:3000"
	@echo "✅ Server:  ws://localhost:8080/ws"
	@echo "✅ Health:  http://localhost:8080/health"

docker-down:
	docker-compose down

logs:
	docker-compose logs -f

# ── Go ────────────────────────────────────────────────────────
go-tidy:
	cd server && go mod tidy

go-build:
	cd server && CGO_ENABLED=0 go build -o relay-server .

# ── Git ───────────────────────────────────────────────────────
git-init:
	git init
	git add .
	git commit -m "feat: initial commit — E2EE relay + WebRTC P2P + Electron"
	@echo "Теперь: git remote add origin <URL> && git push -u origin main"

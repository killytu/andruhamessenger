# ── Stage 1: Build ──────────────────────────────────────────────
FROM golang:1.21-alpine AS builder

WORKDIR /app

# Зависимости (кешируются отдельно)
COPY go.mod go.sum ./
RUN go mod download

# Код
COPY *.go ./
RUN CGO_ENABLED=0 GOOS=linux go build -o relay-server .

# ── Stage 2: Runtime (минимальный образ) ────────────────────────
FROM alpine:3.19

RUN apk --no-cache add ca-certificates tzdata

WORKDIR /app
COPY --from=builder /app/relay-server .

EXPOSE 8080

CMD ["./relay-server"]

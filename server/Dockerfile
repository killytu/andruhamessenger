FROM golang:1.21-alpine AS builder

WORKDIR /app

# Зависимости
COPY go.mod go.sum ./
RUN go mod download

COPY *.go ./
RUN CGO_ENABLED=0 GOOS=linux go build -o relay-server .

FROM alpine:3.19
RUN apk --no-cache add ca-certificates tzdata
WORKDIR /app
COPY --from=builder /app/relay-server .

# Папка для базы данных
RUN mkdir -p /data
ENV DB_PATH=/data/andruha.db

VOLUME ["/data"]
EXPOSE 8080

CMD ["./relay-server"]

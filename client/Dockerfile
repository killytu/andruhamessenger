# ── Stage 1: Build ──────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app
COPY package.json ./
RUN npm install

COPY . .
RUN npm run build

# ── Stage 2: Serve (nginx) ──────────────────────────────────────
FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html

# nginx config для SPA (React Router)
RUN printf 'server {\n\
  listen 80;\n\
  root /usr/share/nginx/html;\n\
  index index.html;\n\
  location / { try_files $uri $uri/ /index.html; }\n\
}\n' > /etc/nginx/conf.d/default.conf

EXPOSE 80

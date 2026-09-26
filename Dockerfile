# syntax=docker/dockerfile:1

# ---------- База: Node 22 + OpenSSL (нужен Prisma) ----------
FROM node:22-bookworm-slim AS base
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# ---------- Сборка фронтенда и сервера ----------
FROM base AS build
COPY package.json package-lock.json* ./
COPY prisma ./prisma
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi
COPY . .
RUN npm run build && npm prune --omit=dev

# ---------- Итоговый образ ----------
FROM base AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    STORAGE_DIR=/data/uploads
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/dist ./dist
RUN mkdir -p /data/uploads
# Контейнер работает от root: Railway монтирует Volume с правами root,
# иначе приложение не сможет сохранять загруженные файлы.
EXPOSE 3000
CMD ["npm", "run", "start:prod"]

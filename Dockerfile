FROM node:22-slim AS base
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund

COPY . .
RUN npm run build

EXPOSE 3000
ENV DATABASE_PATH=/app/data/app.db

# Ao subir: garante a pasta de dados, roda o seed (idempotente) e inicia o app.
CMD ["sh", "-c", "mkdir -p /app/data && npm run seed && npm run start"]

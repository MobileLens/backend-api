FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
# Install ALL deps (including dev) for build
RUN npm ci

COPY . .
RUN npm run build

# ── Production image ──────────────────────────────────────────────────────────

FROM node:20-alpine AS runner

WORKDIR /app

# Native module needs build tools at runtime on alpine
RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist

# Create data directory for SQLite volume mount
RUN mkdir -p /app/data

EXPOSE 3000

CMD ["node", "dist/index.js"]

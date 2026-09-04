FROM node:22-alpine AS builder

WORKDIR /app

# Native modules (better-sqlite3) potrzebują tego już na etapie builda —
# wcześniej ten toolchain był tylko w runnerze, mimo że `npm ci` tutaj
# też instaluje better-sqlite3.
RUN apk add --no-cache python3 make g++

COPY package*.json ./
# Install ALL deps (including dev) for build
RUN npm ci

COPY . .
RUN npm run build

# ── Production image ──────────────────────────────────────────────────────────

FROM node:22-alpine AS runner

WORKDIR /app

# Native module needs build tools at runtime on alpine.
# `sqlite` dodaje binarkę CLI `sqlite3` — potrzebną przez infra/backup.sh,
# które robi `docker exec ... sqlite3 ... ".backup ..."`. Bez tego pakietu
# tej binarki w obrazie w ogóle nie ma (better-sqlite3 to biblioteka Node,
# nie CLI) i backup zawsze kończył się błędem "executable file not found".
RUN apk add --no-cache python3 make g++ sqlite

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist

# Create data directory for SQLite volume mount — należy do usera "node",
# bo proces aplikacji już nie działa jako root (patrz USER node niżej).
RUN mkdir -p /app/data && chown -R node:node /app/data

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "dist/index.js"]

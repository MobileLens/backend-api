# Dockerfile umieszczony w: api/Dockerfile
# Kontekst budowania (context) to katalog api/ — stąd ścieżki src/, tsconfig.json itd.

# ─────────────────────────────────────────────
# Etap 1: budowanie (builder)
# ─────────────────────────────────────────────
FROM node:22-alpine AS builder

# Potrzebne do kompilacji natywnych zależności (better-sqlite3 ma część w C++)
RUN apk add --no-cache python3 make g++

WORKDIR /app

# package.json kopiujemy osobno przed kodem źródłowym —
# Docker cache pominie npm install jeśli package.json się nie zmienił
COPY package.json package-lock.json ./
RUN npm ci

# Reszta kodu źródłowego
COPY tsconfig.json ./
COPY src/ ./src/

# TypeScript → JavaScript (output trafia do dist/)
RUN npm run build


# ─────────────────────────────────────────────
# Etap 2: obraz produkcyjny (runtime)
# ─────────────────────────────────────────────
FROM node:22-alpine AS runtime

# Nieuprzywilejowany użytkownik — kontenery nie powinny działać jako root
RUN addgroup -S app && adduser -S app -G app

WORKDIR /app

# Tylko zależności produkcyjne (bez TypeScript, ts-node, typów itp.)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Skompilowany kod z etapu builder
COPY --from=builder /app/dist ./dist

# Katalog na plik SQLite — tutaj będzie montowany wolumin sqlite-data
RUN mkdir -p /app/data && chown app:app /app/data

USER app

# Musi zgadzać się z Caddyfile: reverse_proxy api:3000
EXPOSE 3000

CMD ["node", "dist/index.js"]

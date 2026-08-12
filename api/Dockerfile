
FROM node:22-alpine AS builder

RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci


COPY tsconfig.json ./
COPY src/ ./src/

RUN npm run build



FROM node:22-alpine AS runtime


RUN addgroup -S app && adduser -S app -G app

WORKDIR /app


COPY package.json package-lock.json ./
RUN npm ci --omit=dev


COPY --from=builder /app/dist ./dist


RUN mkdir -p /app/data && chown app:app /app/data

USER app


EXPOSE 3000

CMD ["node", "dist/index.js"]

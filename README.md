# MobileLens Backend

REST API zbudowane na **Hono + TypeScript**, SQLite (Drizzle ORM), better-auth, MinIO.

## Struktura repo

```
mobilelens/
├── api/                   # Node.js / Hono API
│   ├── src/
│   │   ├── db/
│   │   │   ├── schema.ts  # 11 tabel ERD + tabele better-auth
│   │   │   └── index.ts   # połączenie SQLite (WAL)
│   │   ├── lib/
│   │   │   ├── auth.ts    # better-auth (bearer + jwt)
│   │   │   └── minio.ts   # presigned URLs
│   │   ├── middleware/
│   │   │   └── requireAuth.ts  # session + role guard
│   │   ├── routes/
│   │   │   ├── auth.ts
│   │   │   ├── brands.ts
│   │   │   ├── smartphones.ts  # catalog, search, compare
│   │   │   ├── cameras.ts      # submit + moderate
│   │   │   ├── upload.ts       # presigned PUT flow
│   │   │   ├── reviews.ts
│   │   │   ├── favorites.ts
│   │   │   └── admin.ts        # role mgmt, media moderation
│   │   ├── services/
│   │   │   └── cameraAggregation.ts  # kondensacja zgłoszeń
│   │   └── index.ts       # entry point
│   ├── Dockerfile
│   ├── drizzle.config.ts
│   ├── package.json
│   └── tsconfig.json
├── infra/
│   ├── docker-compose.yml
│   └── Caddyfile
├── backup.sh
├── .env.example
└── .gitignore
```

## Pierwsze wdrożenie (VPS)

```bash
# 1. Sklonuj repo
git clone <repo_url> /opt/mobilelens
cd /opt/mobilelens

# 2. Utwórz .env
cp .env.example .env
nano .env   # wypełnij hasła i sekret

# 3. W Caddyfile podmień domenę
nano infra/Caddyfile

# 4. Uruchom
cd infra
docker compose up -d --build

# 5. Pierwsza migracja (jednorazowo, po starcie kontenera api)
docker compose exec api npm run migrate
```

## Aktualizacja

```bash
git pull
cd infra && docker compose up -d --build
```

## Backup

Dodaj do crontab na VPS:
```
0 3 * * * /opt/mobilelens/backup.sh >> /var/log/mobilelens-backup.log 2>&1
```

---

## Endpointy

| Metoda | Ścieżka | Auth | Opis |
|---|---|---|---|
| GET | `/health` | — | health check |
| ANY | `/api/auth/*` | — | better-auth (login, register, token) |
| GET | `/api/brands` | — | lista marek |
| POST | `/api/brands` | moderator+ | dodaj markę |
| GET | `/api/smartphones` | — | katalog (`?q=&brand_id=&page=&limit=`) |
| GET | `/api/smartphones/compare` | — | porównywarka (`?ids=id1,id2,id3`) |
| GET | `/api/smartphones/:id` | — | szczegół + kamery approved |
| POST | `/api/smartphones` | reviewer+ | dodaj telefon |
| GET | `/api/cameras` | — | kamery telefonu (`?smartphone_id=`) |
| POST | `/api/cameras` | user+ | wyślij zgłoszenie kamery |
| GET | `/api/cameras/pending` | moderator+ | kolejka moderacji |
| PATCH | `/api/cameras/:id/review` | moderator+ | zatwierdź / odrzuć |
| POST | `/api/upload/photo/request` | user+ | presigned PUT URL |
| POST | `/api/upload/photo/confirm` | user+ | zapisz metadane zdjęcia |
| POST | `/api/upload/video/request` | user+ | presigned PUT URL |
| POST | `/api/upload/video/confirm` | user+ | zapisz metadane wideo |
| POST | `/api/upload/review-media/request` | user+ | presigned PUT URL dla mediów recenzji |
| GET | `/api/reviews` | — | recenzje telefonu (`?smartphone_id=`) |
| POST | `/api/reviews` | reviewer+ | utwórz recenzję |
| PATCH | `/api/reviews/:id` | autor / mod | edytuj / zmień status |
| GET | `/api/favorites` | user+ | moje ulubione |
| POST | `/api/favorites/:smartphoneId` | user+ | dodaj do ulubionych |
| DELETE | `/api/favorites/:smartphoneId` | user+ | usuń z ulubionych |
| GET | `/api/admin/users` | moderator+ | lista użytkowników |
| PATCH | `/api/admin/users/:id/role` | admin | zmień rolę |
| DELETE | `/api/admin/users/:id` | admin | soft-delete użytkownika |
| GET | `/api/admin/media/pending` | moderator+ | media do moderacji |
| PATCH | `/api/admin/media/photos/:id` | moderator+ | zatwierdź / usuń zdjęcie |
| PATCH | `/api/admin/media/videos/:id` | moderator+ | zatwierdź / usuń wideo |
| GET | `/api/admin/role-log` | admin | log zmian ról |

## Upload flow (appka mobilna)

```
1. POST /api/upload/photo/request  → { uploadUrl, objectKey }
2. Appka: usuwa GPS/dane osobowe z EXIF lokalnie
3. PUT <uploadUrl>  (bezpośrednio do MinIO, bez backendu)
4. POST /api/upload/photo/confirm  { objectKey, cameraId, widthPx, heightPx, exif* }
```

## Kondensacja zgłoszeń kamer

Co 10 minut scheduler grupuje wiersze `camera` ze `status=pending`
po `(smartphone_id, type, facing)`. Przy ≥ 3 zgłoszeniach i zgodności ≥ 66%:
wartości odstające → `rejected`, reszta → mediana/moda → jeden wiersz `approved`.
Przy niskiej zgodności wiersze zostają `pending` dla moderatora.

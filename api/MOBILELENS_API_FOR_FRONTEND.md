# MobileLens API — instrukcja dla frontendu (dla AI/dewelopera)

Base URL: `https://mobilelens.duckdns.org` · wszystkie endpointy pod `/api/...` · JSON (poza uploadem) · `GET /health` → `{status:"ok"}`.
Strona (frontend web): `https://mobilelens.me`. Wersja dokumentu: 07.11.2026 (sekcje 11–14 to dziennik zmian; najnowsze: e-mail i reset hasła w sekcji 14).

## 1. Zasady ogólne
- **Auth:** Bearer token. Po logowaniu/rejestracji odpowiedź ma `token`; wysyłaj `Authorization: Bearer <token>`. Trzymaj token w pamięci/storage, nie polegaj na ciasteczkach.
- **CORS/Origin:** backend akceptuje tylko originy z `ALLOWED_ORIGINS` na serwerze, dokładne dopasowanie (schemat + host, bez ścieżki i `/` na końcu). Teraz: `https://mobilelens.me`, `https://www.mobilelens.me`, `https://mobilelens.github.io`, `http://localhost:5173`. Inny origin (np. `127.0.0.1`, inny port) → brak nagłówków CORS / `403 INVALID_ORIGIN` przy auth. Nowy origin dopisuje admin serwera. Aplikacje mobilne nie wysyłają `Origin`, więc ich to nie dotyczy.
- **Błędy:** zawsze `{ "error": "<komunikat>", "code": "<STAŁY_KOD>", ...extra }` (np. `field`). Frontend powinien opierać logikę na `code`, nie na tekście.
- **Język komunikatów:** nagłówek `Accept-Language: pl` lub `en` (albo `?lang=pl|en`).
- **Role:** `user < reviewer < moderator < admin`. Rolę zwraca `user.role` przy logowaniu. Rola nie jest ustawiana przy rejestracji.
- **Banned:** `403 USER_BANNED` na dowolnym endponcie z auth; logowanie zbanowanego jest odrzucone.
- **Paginacja:** `?page=1&limit=20` → `{data:[...], page, limit}`.
- **Statystyki:** przy starcie aplikacji wywołaj raz `POST /api/stats/visit` (bez auth, zwraca `{counted}`).
- **EXIF:** frontend usuwa EXIF przed uploadem, ale wartości do pól `exif*` wysyłaj jawnie (patrz upload).

## 2. Auth (`/api/auth`, better-auth)
- `POST /api/auth/sign-up/email` `{email, password, name, username?, callbackURL}` → `{token: null, user}` — **weryfikacja e-maila jest WŁĄCZONA**: konto powstaje, ale token jest `null`, a na adres idzie mail z linkiem. `callbackURL` = **pełny adres** strony, na którą użytkownik wraca po kliknięciu (np. `https://mobilelens.me/login?verified=1`), szczegóły w sekcji 14. Hasło: min. 8 znaków, mała i wielka litera, cyfra, znak specjalny (`PASSWORD_TOO_WEAK`).
- `POST /api/auth/sign-in/email` `{email, password}` → `{token, user:{id,email,name,role,emailVerified,...}}`. Niepotwierdzony adres → `403 EMAIL_NOT_VERIFIED`.
- `GET /api/auth/get-session` (Bearer) · `POST /api/auth/sign-out`.
- Reset hasła, ponowne wysłanie maila, zmiana adresu e-mail: sekcja 14.
- Konto: `GET /api/account/export` (eksport danych), `DELETE /api/account` (usunięcie konta), `GET /api/account/promotion` (oferta awansu), `POST /api/account/promotion/:id/accept|reject`.

## 3. Dane publiczne (bez auth)
- `GET /api/brands`, `GET /api/brands/:id`
- `GET /api/smartphones?q=&brand_id=&sort=&page=&limit=` (+ filtry: `verified`, `variable_aperture`, `optical_zoom`, `video_min_width`, `video_min_fps` — pełna lista w sekcji 11) → lista z `brandName`, `verified`. `sort`: `name` (domyślnie, nazwa modelu) | `brand` (marka, potem model) | `trending` | `new`; inna wartość → `400 INVALID_SORT`
- `GET /api/smartphones/facets[?verified=true|false]` → zakresy filtrów z wartości w katalogu (typ `Facets` w sekcji 10); `Cache-Control: public, max-age=300` + `ETag`
- `GET /api/smartphones/:id` (szczegóły + zatwierdzone aparaty z `videoModes`)
- `GET /api/smartphones/compare?ids=a,b,c` (2–4 id; więcej → `TOO_MANY_IDS`)
- `GET /api/smartphones/:id/photos`, `/videos` (tylko zweryfikowane), `POST /api/smartphones/:id/view`
- `GET /api/cameras?smartphone_id=<id>` (wymagane; zatwierdzone aparaty)
- `GET /api/reviews?smartphone_id=<id>` (opublikowane), `GET /api/reviews/:id`, `GET /api/reviews/:id/comments`

## 3a. Wartości równoważne (35 mm) liczy FRONTEND
API zwraca tylko dane fizyczne. Przelicz po stronie klienta, z pól aparatu:
- równoważna ogniskowa = `focalLengthMm * cropFactor`
- równoważna przysłona = `aperture * cropFactor` (np. f/1.68 przy crop 3.74 → f/6.3)
- przy zmiennej przysłonie / zoomie licz też dla `apertureNarrow` i `focalLengthMaxMm`
API filtruje po tych wartościach: `eq_focal_min`, `eq_focal_max`, `eq_aperture_max` w `GET /api/smartphones`.

## 4. Zalogowany użytkownik
- **Ulubione:** `GET /api/favorites`, `POST|DELETE /api/favorites/:smartphoneId`
- **Zgłoszenie aparatu (do dowolnego telefonu z katalogu, także niezweryfikowanego):** `POST /api/cameras` (każdy zalogowany; status `pending`):
  ```json
  {"smartphoneId":"…","type":"wide|ultrawide|tele|macro|other","facing":"back|front|other",
   "focalLengthMm":6.9,"aperture":1.7,"cropFactor":4.7,"pixelPitchUm":1.2,
   "resolutionMp":200,"activeResolutionMp":50,"afZones":0,"ois":"none|optical|sensor_shift",
   "variableAperture":false,"apertureNarrow":null,"opticalZoom":false,"focalLengthMaxMm":null,
   "sensorFormat":"1/1.28","photoWidthPx":8160,"photoHeightPx":6144,"aspectRatio":"4:3","note":null,
   "videoModes":[{"widthPx":3840,"heightPx":2160,"fpsMax":60,"note":null}]}
  ```
  Zakresy: ogniskowa 0.5–100, przysłona 0.5–32, crop 1–20, pixel pitch 0.1–10, MP 0.1–500, `activeResolutionMp ≤ resolutionMp`. Zmienna przysłona wymaga `apertureNarrow > aperture`; zoom optyczny wymaga `focalLengthMaxMm > focalLengthMm`. Błąd walidacji: `400 INVALID_FIELD` + `field`.
  Pola opcjonalne (można pominąć albo wysłać `null`; `""` = `null`): `sensorFormat` — rozmiar matrycy bez znaku cala, z kropką: `"1/1.28"`, `"1/2.55"`, `"1"`; `photoWidthPx`/`photoHeightPx` — maks. wymiary zdjęcia (liczby całkowite 1–30000; dłuższy bok zawsze trafia do `photoWidthPx` — gdy wyślesz wymiary w pionie, backend sam zamieni boki); `aspectRatio` — proporcje matrycy `"4:3"`, `"3:2"`, `"1:1"`, `"16:9"`; `note` — notatka moderatora (≤500 znaków), wyświetlana jako przypis pod specyfikacją; ustawia ją tylko moderator (od zwykłego użytkownika jest pomijana). Te same pola przyjmują `PATCH /api/cameras/:id` i `PATCH /api/cameras/:id/review`.
  Odpowiedź zawiera `samples` (pokrycie próbkami zdjęć dla zmiennej przysłony/zoomu).
- **Dodanie telefonu do katalogu (ekran „My phone" → „Submit to database"):** `POST /api/smartphones` (każdy zalogowany) `{brandName | brandId, modelName, releaseDate?}`. Aplikacja mobilna zna tylko napisy (np. `Build.MANUFACTURER`/`Build.MODEL`), więc wysyłaj `brandName` — marka jest dopasowywana bez względu na wielkość liter, a gdy jej nie ma, zostaje utworzona. Odpowiedź: `201` nowy wpis (`verified:false`, dopóki moderator go nie potwierdzi) albo `200` z `existing:true`, gdy ten model tej marki już jest (użyj zwróconego `id`). Dalej zgłoś aparat: `POST /api/cameras` z tym `id`. Limit: 10 nowych telefonów na dobę (`429 PHONE_LIMIT_REACHED`; moderator bez limitu). Błędy: `MISSING_FIELDS`, `BRAND_NOT_FOUND` (404), `INVALID_FIELD` (`field`).
- `GET /api/cameras/mine` — własne zgłoszenia z statusem.
- **Upload (multipart/form-data, jedno pole pliku o nazwie `file`; pola tekstowe wysyłaj PRZED `file`):**
  - `POST /api/upload/photo/upload` — pola: `cameraId`, `widthPx`, `heightPx`, opcjonalnie `exifFocalLength`, `exifAperture`, `exifIso`, `exifShutterSpeed`, `exifDigitalZoom` (zoom cyfrowy klatki: liczba 1–100, `1` = bez zoomu, `2` = wycinek 2×; inna/pusta wartość jest zapisywana jako `null` i nie przerywa uploadu) → `{id, status:"pending", objectKey, thumbUrl, mediumUrl}`. Wszystkie pola wysyłaj przed częścią `file`. Zdjęcie jest prywatne do weryfikacji moderatora.
  - `POST /api/upload/video/upload` — pola: `cameraId`, `widthPx`, `heightPx`, `fps` (przed `file`).
  - `POST /api/upload/review-media/upload` — tylko `file` → `{objectKey, storageUrl, url}`; `url` to podpisany link ważny 1 h (podgląd dla autora).
  - `POST /api/upload/device-image/upload` (moderator+) — tylko `file`.
  - Wysyłaj czyste pliki (za duży plik → `413 FILE_TOO_LARGE`).
- **Recenzje:** `POST /api/reviews` `{smartphoneId,title,contentMarkdown,mediaItems?:[{objectKey,type:"photo"|"video",displayOrder}]}` (najpierw upload review-media, potem `objectKey` tutaj). `reviewer`+ publikuje od razu, zwykły użytkownik trafia do `pending`. `GET /api/reviews/mine`, `PATCH /api/reviews/:id` `{title?,contentMarkdown?,status?}` (status: `draft|pending|published|hidden`), `DELETE /api/reviews/:id`.
- **Polubienia/komentarze (tylko opublikowane recenzje):** `POST|DELETE /api/reviews/:id/like`, `POST /api/reviews/:id/comments` `{content}`, `DELETE /api/reviews/comments/:commentId`. Recenzje zwracają `likeCount`, `commentCount`, `likedByMe`, `authorName`.
- **Powiadomienia:** `GET /api/notifications?unread=1&page=&limit=`, `GET /api/notifications/unread-count`, `POST /api/notifications/read-all`, `PATCH /api/notifications/:id/read`. Typy m.in. `camera_reviewed`, oferta awansu.

## 5. Moderator (`moderator`+)
- `POST|PATCH /api/brands`, `PATCH /api/smartphones/:id` (edycja telefonu; `PATCH` ustawia telefon jako zweryfikowany). Telefon dodany przez moderatora (`POST`) jest od razu zweryfikowany i tylko moderator może ustawić mu `imageUrl`.
- `GET /api/cameras/pending` (każde zgłoszenie ma `videoModes`, `samples`, `phone`), `DELETE /api/cameras/:id` (usunięcie aparatu razem z jego zdjęciami, filmami i trybami wideo → `{ok, deletedPhotos, deletedVideos}`; `404 CAMERA_NOT_FOUND`).
- `PATCH /api/cameras/:id` — edycja specyfikacji bez zmiany statusu; `PATCH /api/cameras/:id/review` `{status:"approved"|"rejected", ...poprawki}` — rozpatrzenie zgłoszenia `pending` (inaczej `409 ALREADY_REVIEWED`; aparat identyczny z zatwierdzonym → `409 CAMERA_EXISTS`). Zdjęcia próbne nie są wymagane, `samples` to tylko informacja.
  Obie ścieżki zwracają `{ok:true, camera: Camera & {videoModes: VideoMode[]}}`.
- **Tryby wideo** (np. dopisanie 4K 60 fps albo 1080p 960 fps, których telefon nie zgłosił): opcjonalne pole `videoModes: [{widthPx, heightPx, fpsMax, note?}]` w obu PATCH.
  - To **pełna docelowa lista**: brak pola = bez zmian, `[]` usuwa wszystkie tryby. Same `videoModes` wystarczą (bez `NOTHING_TO_UPDATE`).
  - W `/review` działa tylko przy `approved`; przy `rejected` jest ignorowane.
  - Walidacja: maks. 30 trybów, `widthPx`/`heightPx` 1–16384, `fpsMax` 1–2000 (np. 960 fps, 1920 fps w telefonach Huawei z obiektywem Cine; wartości interpolowane, np. 7680 fps, nie są trybami — moderator zapisuje je w `note` trybu 1920 fps), `note` ≤ 128 znaków; ten sam tryb dwa razy (rozdzielczość bez względu na orientację + `fpsMax`) → `400 INVALID_FIELD` (`field: "videoModes"` albo `"videoModes.fpsMax"` itd.). Przy błędzie nic się nie zapisuje (ani tryby, ani reszta zmian, ani status).
  - Zapis aparatu, statusu i trybów w jednej transakcji.
  - Panel: w karcie zgłoszenia / aparatu lista `videoModes` z polami szer. × wys. × fps + notatka, „Dodaj tryb”, „×” przy trybie; „Zapisz” → `PATCH /api/cameras/:id {videoModes:[...]}`, „Approve” → `PATCH /api/cameras/:id/review {status:"approved", videoModes:[...]}`. Wysyłaj całą listę, także niezmienione tryby.
- Porządki w `sensorFormat` (wartości wyliczone dawniej przez aplikację): `GET /api/cameras/sensor-format-review`, `POST /api/cameras/:id/sensor-format-review` — sekcja 16.
- `GET /api/reviews/pending`; zatwierdzanie recenzji: `PATCH /api/reviews/:id` `{status:"published"|"draft"}` (tylko z `pending`).
- Media: `GET /api/admin/media/pending`, `PATCH /api/admin/media/photos|videos/:id` `{status:"verified"|"deleted"}`, `PATCH …/:id/metadata`.
- Statystyki: `GET /api/admin/stats`, `GET /api/admin/dashboard`.

## 6. Admin (`admin`)
- `GET /api/admin/users`, `PATCH /api/admin/users/:id/role` `{role}` (awans do `reviewer` = oferta, `202 pending`; użytkownik akceptuje w `/api/account/promotion`), `GET|DELETE /api/admin/promotions…`, `DELETE /api/admin/users/:id`, `GET /api/admin/role-log`.
- Bany: `POST /api/admin/users/:id/ban` `{reason (≤500), expiresAt?: ISO przyszła data}`, `DELETE /api/admin/users/:id/ban`, `GET /api/admin/bans`.
- Ukryte recenzje: `GET /api/reviews/hidden`; usuwanie: `DELETE /api/reviews/:id`, marek/telefonów: `DELETE /api/brands|smartphones/:id` (usunięcie telefonu usuwa też jego aparaty, zdjęcia i filmy; `404 SMARTPHONE_NOT_FOUND`).

## 7. Media
- Publiczne pliki (zdjęcia urządzeń, zweryfikowane zdjęcia/wideo, opublikowane media recenzji) są pod `https://mobilelens.duckdns.org/media/...`. Używaj pola `url`/`imageUrl` z odpowiedzi API — nie składaj adresów ręcznie.
- Prywatne pliki (przed weryfikacją) mają podpisane linki `/api/media/private/...?exp&sig` (ważne 1–2 h, wideo z Range). Po wygaśnięciu pobierz zasób z API ponownie.

## 8. Najczęstsze kody błędów
`UNSUPPORTED_MEDIA_TYPE`(400) · `BUILD_MODEL_TAKEN`(409) · `MERGE_SAME_PHONE`(400) · `INVALID_ORIGIN`(403) · `USER_BANNED`(403) · `FORBIDDEN`(403) · `UNAUTHORIZED`(401) · `MISSING_FIELDS`/`INVALID_FIELD`(400, `field`) · `INVALID_BODY`(400) · `NOT_FOUND`/`SMARTPHONE_NOT_FOUND`/`REVIEW_NOT_FOUND`(404) · `REVIEW_NOT_PUBLISHED`(409) · `ALREADY_REVIEWED`/`CAMERA_EXISTS`/`DUPLICATE_SUBMISSION`(409) · `UPLOAD_NOT_FOUND`(409) · `TOO_MANY_IDS`(400) · `INVALID_FILTER`/`INVALID_SORT`/`INVALID_PAGE`(400) · auth: `EMAIL_NOT_VERIFIED`(403), `INVALID_EMAIL_OR_PASSWORD`(401), `PASSWORD_TOO_WEAK`(400), `INVALID_TOKEN`(400), `USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL`(422).

## 9. Konto testowe (tylko dev)
`admin@test.com` / `Test1234!Admin` (rola admin). Zmień/usuń przed oddaniem projektu.

## 10. Kształty odpowiedzi (TypeScript) — nie trzeba wywoływać endpointów, żeby poznać typy
Daty (`Date`) przychodzą jako ISO string (`"2026-10-09T15:59:20.000Z"`). `null` = brak wartości. Wszystkie `*Url`/`url` w odpowiedziach są gotowymi adresami https do użycia w `<img>`/`<video>`.

```ts
type Role = "user" | "reviewer" | "moderator" | "admin";
type Paged<T> = { data: T[]; page: number; limit: number };

// ── katalog ──
type Brand = { id: string; name: string; logoUrl: string | null };
type PhoneListItem = {              // GET /api/smartphones -> Paged<PhoneListItem> & {total:number; sort:string}
  id: string; modelName: string; imageUrl: string | null; releaseDate: string | null; // "YYYY-MM-DD"
  viewCount: number; brandId: string; brandName: string | null; createdAt: string; verified: boolean;
  imageThumbUrl: string | null;     // miniatura 512 px (WebP) do kart/list; null -> użyj imageUrl
  imageMediumUrl: string | null;    // 1024 px (WebP) do dużych widoków (nagłówek szczegółów); null -> imageUrl
};
type FacetRange = {                 // jeden typ aparatu w GET /api/smartphones/facets
  count: number;                    // liczba zatwierdzonych tylnych aparatów tego typu; 0 -> reszta pól null, fpsValues []
  eqFocalMin: number | null; eqFocalMax: number | null;       // ekwiwalent ogniskowej (mm); max uwzględnia zoom optyczny
  eqApertureMin: number | null; eqApertureMax: number | null; // ekwiwalent przysłony (f * crop); max uwzględnia zmienną przysłonę
  sensorDenominatorMin: number | null; sensorDenominatorMax: number | null; // "1/1.28" -> 1.28 (bez sensorFormat: sensorDenominatorApprox)
  resolutionMpMin: number | null; resolutionMpMax: number | null;
  fpsValues: number[];              // unikalne fpsMax trybów wideo, rosnąco
  videoMaxFpsByWidth: { "854": number | null; "1280": number | null; "1920": number | null; "3840": number | null; "7680": number | null };
                                    // największy fpsMax trybu o dłuższym boku >= progu (tryby w pionie liczą się po dłuższym boku); null = brak
};                                  // liczby zaokrąglone do 2 miejsc
type Facets = {
  types: Record<"wide" | "ultrawide" | "tele" | "macro" | "other", FacetRange>; // tylko tylne aparaty
  front: FacetRange;                // wszystkie zatwierdzone przednie aparaty (dowolny typ) razem
};
type CameraSamples = {              // pokrycie próbkami (zmienna przysłona / zoom)
  required: number; needsApertureSamples: boolean; needsZoomSamples: boolean;
  apertureValues: number; focalLengthValues: number; satisfied: boolean;
};
type VideoMode = { id: string; cameraId: string; widthPx: number; heightPx: number; fpsMax: number; note: string | null };
type Camera = {                     // GET /api/cameras?smartphone_id, elementy detalu telefonu, /pending, /mine
  id: string; smartphoneId: string; submitterId: string; reviewedBy: string | null;
  status: "pending" | "approved" | "rejected"; submittedAt: string; reviewedAt: string | null;
  type: "wide" | "ultrawide" | "tele" | "macro" | "other"; facing: "back" | "front" | "other";
  focalLengthMm: number; aperture: number; cropFactor: number; pixelPitchUm: number;
  resolutionMp: number; activeResolutionMp: number; afZones: number | null; ois: "none" | "optical" | "sensor_shift" | null; // null = nieznane
  variableAperture: boolean; apertureNarrow: number | null; opticalZoom: boolean; focalLengthMaxMm: number | null;
  sensorFormat: string | null;      // "1/1.28" (bez znaku cala; frontend dokleja ″) — TYLKO wartość podana przez człowieka, nigdy wyliczona
  sensorDenominator: number | null; // z sensorFormat ("1/1.28" -> 1.28), tylko do odczytu
  sensorFormatApprox: string | null;      // przybliżenie liczone przez backend ("1/2.55", "1"), tylko do odczytu; null = brak danych do wyliczenia
  sensorDenominatorApprox: number | null; // to samo jako liczba (2.55), tylko do odczytu
  // WYŚWIETLANIE: sensorFormat ? `${sensorFormat}″` : sensorFormatApprox ? `≈${sensorFormatApprox}″` : "—"
  sensorModel: string | null;       // model matrycy, np. "Sony IMX989" (maks. 64 znaki; z urządzenia albo od moderatora)
  photoWidthPx: number | null; photoHeightPx: number | null; // maks. wymiary zdjęcia, zawsze szerokość ≥ wysokość
  aspectRatio: string | null;       // "4:3" | "3:2" | "1:1" | ...
  note: string | null;              // notatka moderatora (tylko moderator ją ustawia) -> przypis pod specyfikacją
  videoModes?: VideoMode[];         // jest w GET /cameras?smartphone_id, detalu telefonu, /cameras/pending, /cameras/mine i w odpowiedzi PATCH
  samples?: CameraSamples;          // jest w POST /cameras, GET /cameras/mine, GET /cameras/pending
};
type PhoneDetail = {                // GET /api/smartphones/:id ; /compare?ids= zwraca PhoneDetail[]
  id: string; brandId: string; addedBy: string; verifiedBy: string | null; modelName: string;
  imageUrl: string | null; releaseDate: string | null; viewCount: number; createdAt: string;
  verified: boolean; brandName: string | null; brandLogoUrl: string | null;
  imageThumbUrl: string | null;     // miniatura 512 px
  imageMediumUrl: string | null;    // 1024 px
  buildModels: string[];            // kody modelu z urządzeń, np. ["SM-S928B","SM-S928U"]
  cameras: Camera[];                // tylko status "approved", z videoModes
};
type PhotoItem = {                  // GET /api/smartphones/:id/photos -> Paged<PhotoItem> (tylko zweryfikowane)
  id: string; cameraId: string; cameraType: Camera["type"]; facing: Camera["facing"];
  widthPx: number; heightPx: number; uploadDate: string; url: string | null;
  thumbUrl: string | null;          // 480 px WebP (siatka galerii); null -> url
  mediumUrl: string | null;         // 1280 px WebP (podgląd); null -> url
  exifFocalLength: number | null;   // rzeczywista ogniskowa, mm (wartości z pól formularza przy uploadzie)
  exifAperture: number | null;      // liczba f
  exifIso: number | null;           // ISO (liczba całkowita)
  exifShutterSpeed: number | null;  // czas naświetlania w sekundach, np. 0.00136799 = 1/731 s
  exifDigitalZoom: number | null;   // zoom cyfrowy zapisanej klatki względem pola widzenia aparatu: 1 = bez zoomu, 2 = wycinek 2x, null = nieznany
                                    // ekwiwalent 35 mm klatki = exifFocalLength * cropFactor aparatu * exifDigitalZoom
};   // odpowiedź: { data, page, limit, total }
type VideoItem = Omit<PhotoItem, "exifFocalLength" | "exifAperture" | "exifIso" | "exifShutterSpeed" | "exifDigitalZoom"> & { fps: number };   // GET /api/smartphones/:id/videos

// ── recenzje ──
type ReviewMedia = { id: string; reviewId: string; type: "photo" | "video"; storageUrl: string; displayOrder: number; url: string | null;
  thumbUrl: string | null;          // 480 px WebP dla zdjęć (siatka); null dla filmów
  mediumUrl: string | null };       // 1280 px WebP dla zdjęć (w treści recenzji); url = oryginał w pełnej rozdzielczości z EXIF aparatu
type PhoneSummary = { id: string; modelName: string; brandName: string | null; imageUrl: string | null;
  imageThumbUrl: string | null; imageMediumUrl: string | null };
type Review = {                     // GET /reviews?smartphone_id (tablica), /reviews/:id, /mine, /pending, /hidden
  id: string; authorId: string; smartphoneId: string; title: string; contentMarkdown: string;
  status: "draft" | "pending" | "published" | "hidden"; createdAt: string; updatedAt: string;
  authorName: string | null; likeCount: number; commentCount: number; likedByMe: boolean; media: ReviewMedia[];
  phone: PhoneSummary | null;       // telefon główny recenzji (= smartphoneId)
  smartphoneIds: string[];          // wszystkie telefony recenzji, główny pierwszy (zwykła recenzja: 1 element)
  phones: PhoneSummary[];           // to samo z nazwami i zdjęciami, w tej samej kolejności
  isComparison: boolean;            // smartphoneIds.length > 1
};   // listy: tablica Review[]; z ?page/&limit -> { data, page, limit, total }
type ReviewSummary = Omit<Review, "contentMarkdown" | "media"> & {   // listy z ?summary=1
  excerpt: string; coverUrl: string | null; mediaCount: number;
};
type Comment = { id: string; reviewId: string; authorId: string; authorName: string; content: string; createdAt: string };
// GET /reviews/:id/comments -> Paged<Comment> ; POST /reviews/:id/comments -> 201 Comment ;
// POST|DELETE /reviews/:id/like -> {liked:boolean; likeCount:number}
// POST /reviews -> 201 (wiersz recenzji + smartphoneIds, isComparison); PATCH /reviews/:id -> {ok:true; status; review: Review}

// ── użytkownik ──
type Favorite = { smartphoneId: string; addedAt: string; modelName: string | null; imageUrl: string | null; brandName: string | null;
  brandId: string | null; releaseDate: string | null; verified: boolean; imageThumbUrl: string | null; imageMediumUrl: string | null };
// GET /api/favorites -> Favorite[] (najnowsze pierwsze)
type Notification = {               // GET /api/notifications -> Paged<Notification> ; /unread-count -> {unread:number}
  id: string; type: "camera_reviewed" | "promotion_offer" | "promotion_decision" | "review_status" | "role_changed";
  payload: Record<string, unknown>; read: boolean; createdAt: string;
};
// payload: camera_reviewed {cameraId,smartphoneId,status} · review_status {reviewId,status} ·
//          promotion_offer {offerId,offeredBy} · promotion_decision {offerId,userId,decision:"accepted"|"rejected"} · role_changed {previousRole,newRole}
type PromotionOffer = { id: string; userId: string; offeredBy: string | null; status: "pending" | "accepted" | "rejected" | "cancelled"; createdAt: string; respondedAt: string | null };
// GET /api/account/promotion -> PromotionOffer | null ; POST .../accept|reject -> {ok:true; status:"accepted"|"rejected"}

// ── upload ──
// POST /upload/photo/upload   -> 201 {id; status:"pending"; objectKey; thumbUrl; mediumUrl}
// GET  /upload/photos/mine    -> {data: MyPhoto[]; page; limit; total}   (sekcja 12)
// POST /upload/video/upload   -> 201 {id; status:"pending"; objectKey}
// POST /upload/review-media/upload -> 201 {objectKey; storageUrl; url; type:"photo"|"video"; widthPx; heightPx; thumbUrl; mediumUrl}
//      (objectKey wstaw do mediaItems recenzji; widthPx/heightPx oryginału po uwzględnieniu orientacji, null dla filmów)
// POST /upload/device-image/upload -> 201 {objectKey; storageUrl; url; imageThumbUrl; imageMediumUrl}   (storageUrl wstaw jako imageUrl telefonu lub logoUrl marki)

// ── moderator / admin ──
// GET /admin/media/pending -> {photos: (PhotoRow & {url})[]; videos: (VideoRow & {url})[]}
//   PhotoRow = {id,uploaderId,cameraId,storageUrl,exifFocalLength,exifAperture,exifIso,exifShutterSpeed,exifDigitalZoom,widthPx,heightPx,uploadDate,status}
//   VideoRow = {id,uploaderId,cameraId,storageUrl,widthPx,heightPx,fps,uploadDate,status}  ; url = podpisany link 1 h
// PATCH /admin/media/photos|videos/:id -> {ok:true} ; .../metadata body: foto {cameraId?,exifFocalLength?,exifAperture?,exifIso?,exifShutterSpeed?,exifDigitalZoom? (1–100 albo null, inaczej 400),widthPx?,heightPx?} wideo {cameraId?,widthPx?,heightPx?,fps?}
type AdminUser = { id: string; name: string; email: string; username: string | null; role: Role; createdAt: string; isDeleted: boolean };
// GET /admin/users -> AdminUser[]
// PATCH /admin/users/:id/role {role} -> 200 {ok;previousRole;newRole}  ALBO 202 {ok;status:"pending";offerId} (awans user->reviewer = oferta)
// GET /admin/promotions -> (PromotionOffer & {userName:string})[] ; DELETE /admin/promotions/:id -> {ok:true}
type Ban = { id: string; userId: string; userName?: string; reason: string; bannedBy: string; createdAt: string; expiresAt: string | null; revokedAt?: string | null; active?: boolean };
// POST /admin/users/:id/ban -> 201 Ban ; DELETE .../ban -> {ok:true} ; GET /admin/bans?limit= -> Ban[] (z userName, revokedAt, active)
type Stats = { visitsLast24h: number; visitsLastWeek: number; activeUsers: number; registrationsLast30Days: number;
  activeBans: number; totalBans: number; publishedReviews: number; pendingReviews: number;
  databaseSubmissions: number; pendingSubmissions: number; phonesInDatabase: number };
// GET /admin/stats -> Stats ; GET /admin/dashboard -> {reviewSubmissions: Review-like[]; recentBans: Ban[]; hiddenReviews: Review-like[]; stats: Stats}
// GET /admin/role-log -> {id,targetId,previousRole,newRole,changedAt,changedBy}[]
// GET /api/account/export -> {exportedAt, profile, favorites, reviews, cameraSubmissions, comments, likes, notifications, photos, videos}
// proste potwierdzenia: {ok:true}   (DELETE-y, PATCH /cameras/:id/review, PATCH /smartphones/:id, PATCH /brands/:id)
// POST /brands -> 201 {id,name,logoUrl} ; POST /smartphones -> 201|200 {id,brandId,addedBy,verifiedBy,modelName,imageUrl,releaseDate,viewCount,createdAt,verified:boolean,existing:boolean}
```

Uwagi:
- `GET /api/smartphones/:id` **nie** liczy wyświetleń. Liczenie robi `POST /api/smartphones/:id/view` (raz przy wejściu na ekran szczegółów) → `{counted:boolean}`. Bez tego "Trending" się nie zmienia.
- Błąd zawsze ma kształt `{error:string; code:string; field?:string}` (pkt 1). Walidacja aparatu: `code:"INVALID_FIELD"` + `field`.
- Pole `verified` telefonu = `verifiedBy !== null` (moderator robi `PATCH /smartphones/:id`).


## 11. Zmiany z 29.10.2026 (wydajność, kody modelu, scalanie) — wszystko addytywne
Stare pola i parametry działają jak dotąd. Nowe:

**Katalog**
- `GET /api/smartphones`: `brand_id=a,b,c` (albo powtórzony parametr, maks. 20), `ois=optical,sensor_shift` (lista), `eq_aperture_min` (zakres przysłony aparatu musi przeciąć `[min,max]`), `sensor_den_min` / `sensor_den_max` (rozmiar matrycy jako mianownik: `1/1.28"` → 1.28; mniejsza liczba = większa matryca; aparat bez `sensorFormat` → `sensorDenominatorApprox`, patrz sekcja 16). `q` szuka też po kodach modelu.
- Sortowanie `name` jest bez rozróżniania wielkości liter (iPhone, realme na właściwym miejscu). `GET /api/brands` też.
- `sort=brand` (GET i `POST /search`): najpierw nazwa marki, potem nazwa modelu, obie bez rozróżniania wielkości liter. „Xiaomi 12” (model „12”) trafia do Xiaomi, a nie na górę listy jak przy `sort=name`.
- Sortowanie po nazwach (`name`, `brand`, lista marek) jest **naturalne**: liczby porównywane jako liczby — „Galaxy S8, S9, S10, S20 FE”, „Pixel 9, 9a, 10”, „iPhone 11, 13, 16” (a nie „S20” przed „S8”).
- `POST /api/smartphones/search` — to samo co lista, ale JSON i **kilka aparatów naraz** (AND):
  ```json
  {"q":"","brandIds":["a","b"],"sort":"name","verified":true,"page":1,"limit":50,
   "cameras":[{"type":"tele","facing":"back","ois":["optical","sensor_shift"],"eqFocalMin":70,"eqApertureMax":3.5,
               "sensorDenominatorMin":null,"sensorDenominatorMax":null,"eqApertureMin":null,"opticalZoom":false},
              {"type":"wide"}]}
  ```
  Odpowiedź: `{data,page,limit,total,sort}`. `false` w `variableAperture`/`opticalZoom` = brak filtra.
- **Tryby wideo w wyszukiwarce** (`POST /search`):
  - w elemencie `cameras[]`: `videoMinWidth` (int 1–16384) i `videoMinFps` (1–2000) — aparat ma **jeden tryb** wideo, w którym jednocześnie dłuższy bok (`MAX(widthPx, heightPx)`, więc tryby w pionie też się liczą) ≥ `videoMinWidth` i `fpsMax` ≥ `videoMinFps`. 4K 30 + 1080p 120 jako osobne tryby **nie** spełniają `{videoMinWidth:3840, videoMinFps:120}`. Jedno pole bez drugiego = drugie bez warunku; `null` = brak warunku. Element bez `type` = dowolny aparat, np. `{"facing":"back","videoMinFps":960}`.
  - na najwyższym poziomie: `"allBackCamerasVideo": {"minWidth":3840, "minFps":60}` — **każdy** zatwierdzony tylny aparat `wide`/`ultrawide`/`tele` ma taki tryb (makro i `other` pomijane); telefon musi mieć co najmniej jeden taki aparat. `null`, brak albo `{}` = brak filtra.
  - `GET /api/smartphones`: to samo dla jednego aparatu jako `video_min_width` i `video_min_fps` (łączone z `camera_type`, `facing` itd.).
  - Błędy: `400 INVALID_FILTER` + `field` (np. `cameras[0].videoMinFps`, `allBackCamerasVideo.minWidth`, `video_min_width`).
- **`frontCameraCountMin`** (`POST /search`, int 1–5, opcjonalne): telefon ma co najmniej tyle zatwierdzonych przednich aparatów. Błąd → `400 INVALID_FILTER`, `field: "frontCameraCountMin"`. Warunki dla samego przedniego aparatu: element `cameras[]` z `"facing":"front"` (bez `type`).
- **`GET /api/smartphones/facets`** — zakresy kół wyboru z wartości faktycznie obecnych w bazie (zamiast stałych zakresów). Tylko zatwierdzone tylne aparaty, `?verified=` jak w liście. Odpowiedź `Facets` (sekcja 10), np.
  `{"types":{"wide":{"count":12,"eqFocalMin":22,"eqFocalMax":28,"eqApertureMin":4.1,"eqApertureMax":8.9,"sensorDenominatorMin":1,"sensorDenominatorMax":2.8,"resolutionMpMin":12,"resolutionMpMax":200,"fpsValues":[24,30,60,120,240,960]},"ultrawide":{...},"tele":{...},"macro":{...},"other":{"count":0,...,"fpsValues":[]}},"front":{"count":20,...}}`.
  - `videoMaxFpsByWidth` w każdym typie i we `front`: np. `{"854":960,"1280":960,"1920":960,"3840":120,"7680":30}` (progi: 854 = 480p, 1280 = 720p, 1920 = 1080p, 3840 = 4K, 7680 = 8K) — po wyborze rozdzielczości pokaż w kole fps tylko wartości ≤ tej liczbie (`null` = brak trybów w tej rozdzielczości).
  - `front` ma ten sam kształt co pojedynczy typ i jest liczony z przednich aparatów; `types` nadal tylko z tylnych.
- Lista, szczegóły, ulubione: `imageThumbUrl` (512 px WebP; `null` → użyj `imageUrl`).
- Szczegóły i porównanie: `buildModels: string[]`.
- Pole aparatu `sensorDenominator` (liczone przez backend z `sensorFormat`, tylko do odczytu). Filtry i facety matrycy używają `sensorDenominator ?? sensorDenominatorApprox` (sekcja 16).

**Kody modelu z urządzenia (`buildModels`)**
- Android: `Build.MODEL` (np. `SM-S928B`), iOS: identyfikator (np. `iPhone16,1`). Jeden telefon może mieć wiele kodów, kod należy do jednego telefonu.
- `POST /api/smartphones` przyjmuje `buildModels: string[]` (maks. 20). Jeśli którykolwiek kod jest w katalogu → zwraca ten telefon (`200, existing:true`), nawet gdy `modelName` się różni; nowe kody są dopisywane. `modelName` = nazwa handlowa.
- `POST /api/smartphones?include=cameras` → odpowiedź w kształcie `GET /:id` (z aparatami, marką, kodami) + `existing`.
- `GET /api/smartphones/by-model?model=SM-S928B[&brand=samsung]` → dokładne dopasowanie (najpierw kod, potem nazwa modelu, bez wielkości liter) → szczegóły telefonu albo `404 NOT_FOUND`.
- Moderator: `PATCH /api/smartphones/:id {buildModels:[...]}` zastępuje listę; kod innego telefonu → `409 BUILD_MODEL_TAKEN` (+ `buildModel`, `smartphoneId`).
- Moderator: `POST /api/smartphones/:id/merge {sourceId}` — scala duplikat `sourceId` z telefonem `:id` (aparaty ze zdjęciami, recenzje, ulubione, kody, wyświetlenia; nazwa duplikatu trafia do kodów) i usuwa duplikat → `{ok, moved:{cameras,reviews,favorites,buildModels}, smartphone: PhoneDetail}`.

**Galeria**
- `GET /api/smartphones/:id/photos|videos`: `total`, filtry `camera_id`, `facing`; tylko zdjęcia zatwierdzonych aparatów. Zdjęcia mają `thumbUrl` (480 px) i `mediumUrl` (1280 px), `null` → `url`.

**Upload**
- Typ pliku jest rozpoznawany po zawartości (nie po nagłówku). Zdjęcia: JPEG, PNG, WebP, GIF, HEIC, AVIF; filmy: MP4, MOV, WebM; inne → `400 UNSUPPORTED_MEDIA_TYPE`.
- Backend sam usuwa metadane ze zdjęć bezstratnie; orientacja zostaje. Wartości `exif*` nadal wysyłaj w polach formularza. (Od wersji z sekcji 12 dane aparatu w EXIF zostają, znikają tylko prywatne.)
- HEIC jest przyjmowany, ale bez miniatur (`thumbUrl:null`) i bez usuwania metadanych — iOS: najlepiej wysyłać JPEG.
- ~~Obrazy w recenzjach: maks. 15 MB, zmniejszane do 2048 px.~~ (zmienione w sekcji 12: pełna rozdzielczość, maks. 60 MB). Zdjęcie telefonu: zmniejszane do 1600 px, HEIC odrzucany.

**Recenzje**
- Każda recenzja ma `phone {id, modelName, brandName, imageUrl, imageThumbUrl}`; media zdjęć mają `thumbUrl`.
- Listy (`?smartphone_id`, `/mine`, `/pending`, `/hidden`): `summary=1` → bez `contentMarkdown` i `media`, z `excerpt` (~200 znaków), `coverUrl`, `mediaCount`. `page`/`limit` (maks. 50) → `{data,page,limit,total}`; bez nich zwykła tablica.
- Komentarze: `total`. `GET /api/reviews/:id?include=comments&comment_limit=20` → pole `comments: {data,page,limit,total}`.

**Ulubione**
- `POST /api/favorites/:id` dla nieistniejącego telefonu → `404 SMARTPHONE_NOT_FOUND` (było 500).
- `POST /api/favorites/bulk {smartphoneIds:[...]}` (maks. 200) → `{added, alreadyFavorite, missing:[...]}`.
- `POST /api/favorites/bulk-delete {smartphoneIds:[...]}` → `{removed}`.

**Aparaty**: `GET /api/cameras/mine` i `/pending` mają `phone {id, modelName, brandName, imageUrl, imageThumbUrl}`.

**Cache**
- Katalog (`/api/smartphones`, `/:id`, `/compare`, galerie): `Cache-Control: public, max-age=30, stale-while-revalidate=120` + `ETag`. Marki: `max-age=300`. Wysyłaj `If-None-Match` → `304`.
- Dane użytkownika (recenzje, ulubione, powiadomienia, panel): `private, no-cache` + `ETag` (recenzje) — klient może trzymać, ale musi potwierdzić.
- Podpisane linki do prywatnych plików są stałe przez 1–2 h (`exp` zaokrąglony do pełnej godziny) i można je cache'ować do czasu wygaśnięcia.
- Odpowiedzi JSON są kompresowane (gzip/zstd) przez serwer.


## 12. Zmiany z 29.10.2026 (druga aktualizacja: iOS) — recenzje porównawcze, pełna rozdzielczość, EXIF
Addytywne, z jednym wyjątkiem: **`ois` i `afZones` aparatu mogą być `null`** (Android: pola w DTO muszą być nullable).

**Recenzje porównawcze**
- `POST /api/reviews` przyjmuje `smartphoneIds: string[]` (1–5 różnych telefonów, **pierwszy = główny**). Stare `smartphoneId` działa jak dotąd; gdy podane oba, `smartphoneId` jest głównym, reszta listy dochodzi za nim.
  Błędy: `400 INVALID_SMARTPHONES` (pusta lista, > 5, zły typ), `404 SMARTPHONE_NOT_FOUND` + `missing: string[]`.
- Każda recenzja ma `smartphoneIds`, `phones: PhoneSummary[]` (w tej kolejności) i `isComparison`. `phone`/`smartphoneId` = telefon główny.
- `GET /api/reviews?smartphone_id=X` zwraca też recenzje porównawcze, w których X jest jednym z telefonów. Opcjonalnie `&comparison=only` (tylko porównawcze) albo `&comparison=exclude` (bez nich).
- `PATCH /api/reviews/:id {smartphoneIds:[...]}` — nowa pełna lista (autor).
- Scalanie telefonów przenosi je też w porównaniach (bez duplikatów). Usunięcie telefonu: porównanie zostaje z kolejnym telefonem jako głównym; recenzja tylko o tym telefonie znika razem z plikami.

**Edycja mediów recenzji: `PATCH /api/reviews/:id {mediaItems:[...]}`** (tylko autor)
- `mediaItems` to **pełna docelowa lista** (dodanie, usunięcie, kolejność w jednym żądaniu). Element:
  - istniejące medium: `{ "id": "<id z media[]>" }` albo `{ "objectKey": "<klucz już podpiętego pliku>" }`,
  - nowy plik z `/api/upload/review-media/upload`: `{ "objectKey": "...", "type"?: "photo"|"video" }` (typ domyślnie z rozszerzenia),
  - opcjonalnie `displayOrder` (liczba) — sortowanie; bez niego kolejność tablicy. Backend numeruje od 0.
- Media, których nie ma na liście, są usuwane (także pliki z dysku). `[]` usuwa wszystko. Bez pola `mediaItems` media się nie zmieniają.
- Maks. 30 elementów. Błędy: `400 INVALID_MEDIA` (zły element, obce `id`, duplikat, zły `objectKey`), `409 UPLOAD_NOT_FOUND`, `409 INVALID_MEDIA` (plik należy do innej recenzji).
- Zmiana treści, telefonów lub mediów przez zwykłego użytkownika w opublikowanej recenzji → wraca do `pending` (reviewer+ zostaje `published`).
- Odpowiedź PATCH: `{ok:true, status, review: Review}` — zaktualizowana recenzja z mediami (nie trzeba robić GET).

**Zdjęcia w pełnej rozdzielczości z EXIF**
- `POST /api/upload/review-media/upload`: obraz **bez zmniejszania i bez ponownego kodowania**, maks. **60 MB**. `widthPx/heightPx` oryginału (z orientacją).
- Odpowiedź i `media[]`: `url` = oryginał, `mediumUrl` = 1280 px WebP, `thumbUrl` = 480 px WebP.
- EXIF (recenzje i galeria aparatów): **zostaje** producent, model, oprogramowanie, data, strefa czasowa, orientacja, czas naświetlania, przysłona, ISO, kompensacja, tryb/pomiar/flesz/balans bieli, ogniskowa i ekwiwalent 35 mm, zoom cyfrowy, producent/model/specyfikacja obiektywu.
  **Usuwane**: GPS, numer seryjny aparatu i obiektywu, właściciel (`CameraOwnerName`, `Artist`, `Copyright`), `HostComputer`, `ImageUniqueID`, `UserComment`, `MakerNote`, XMP, IPTC, miniatura w EXIF, dane doklejone za obrazem (motion photo). Piksele bez zmian (JPEG, PNG, WebP).
- Zdjęcia telefonów w katalogu (moderator) nadal bez EXIF.

**Większe miniatury (koniec z pikselozą)**
- Telefony: nowe `imageMediumUrl` (1024 px) wszędzie, gdzie jest `imageThumbUrl` (lista, szczegóły, ulubione, `phone`/`phones` w recenzjach i aparatach).
- Recenzje: `mediumUrl` (1280 px) w mediach.
- Którego używać (ekran 3x): karta/komórka do ~170 pt → `imageThumbUrl`/`thumbUrl`; obraz na całą szerokość → `imageMediumUrl`/`mediumUrl`; pełny ekran z zoomem → `url`. Zawsze `null` → następny większy.
- Miniatury dla starych plików tworzą się same w tle po wdrożeniu (kilkanaście sekund po starcie).

**Aparaty**
- `ois` i `afZones`: brak pola albo `null` = **nieznane**; `"none"` / `0` = na pewno brak. Stare dane mają dotychczasowe wartości. Filtr `ois=` pomija `null`.
- `POST /api/cameras`: drugie **oczekujące** zgłoszenie tego samego użytkownika dla tego samego telefonu, `type` i `facing` → `409 DUPLICATE_SUBMISSION` + `cameraId` (istniejące zgłoszenie). Po zatwierdzeniu/odrzuceniu można zgłosić ponownie.

**Moje zdjęcia: `GET /api/upload/photos/mine`**
- Parametry: `status=pending|verified`, `cameraId`, `smartphoneId`, `page` (od 1), `limit` (1–100, domyślnie 30). Najnowsze pierwsze, bez usuniętych.
- ```ts
  type MyPhoto = { id: string; cameraId: string; smartphoneId: string; cameraType: Camera["type"]; facing: Camera["facing"];
    status: "pending" | "verified"; widthPx: number; heightPx: number; uploadDate: string;
    exifFocalLength: number | null; exifAperture: number | null; exifIso: number | null; exifShutterSpeed: number | null; exifDigitalZoom: number | null;
    phone: PhoneSummary | null; url: string | null; thumbUrl: string | null; mediumUrl: string | null };
  // -> { data: MyPhoto[]; page; limit; total }   (pending: podpisane linki 1-2 h, verified: publiczne)
  ```

**Równoczesna praca moderatorów (bez klonów aparatów)**
- Ręczne zatwierdzenie (`PATCH /api/cameras/:id/review`) nie wymaga zdjęć próbnych; `samples` jest tylko informacją.
- Rozpatrzyć można tylko zgłoszenie `pending`. Gdy ktoś już to zrobił → `409 ALREADY_REVIEWED` + `status` (aktualny). UI: odśwież kolejkę i pokaż „Ktoś już rozpatrzył to zgłoszenie”.
- Aparat identyczny z już zatwierdzonym (ten sam telefon, `type`, `facing`, ogniskowa, przysłona, rozdzielczość):
  `POST /api/cameras` i zatwierdzenie → `409 CAMERA_EXISTS` + `cameraId` (istniejący aparat). UI: „Ten aparat już jest w katalogu”, przy zgłoszeniu w kolejce → odrzuć je.
  Różne obiektywy tego samego typu (np. dwa tele) różnią się ogniskową i przechodzą normalnie.


## 13. Model matrycy aparatu (31.10.2026)
- Nowe opcjonalne pole aparatu `sensorModel: string | null` (np. `"Sony IMX989"`, `"Samsung ISOCELL HP2"`), maks. 64 znaki.
- Wysyła je każdy w `POST /api/cameras` (Android, gdy uda się odczytać model z urządzenia); moderator poprawia w `PATCH /api/cameras/:id` i `/review`. Brak pola, `null` albo `""` = nieznane.
- Backend przycina spacje na końcach i scala wielokrotne spacje. Za długie albo nie-tekst → `400 INVALID_FIELD`, `field: "sensorModel"`.
- Zwracane wszędzie, gdzie jest aparat: szczegóły telefonu, `/compare`, `GET /api/cameras`, `/cameras/mine`, `/cameras/pending`, odpowiedzi POST/PATCH.
- Pole addytywne: aplikacje, które go nie znają, działają bez zmian (DTO: `String? = null`).


## 14. E-mail: weryfikacja, reset hasła, zmiana adresu (04–06.11.2026)
Maile wysyła serwer (Resend, nadawca `MobileLens <no-reply@mobilelens.me>`), treść PL + EN. Linki w mailach prowadzą najpierw do API (`mobilelens.duckdns.org/api/auth/...`), API sprawdza token i **przekierowuje na adres podany przez klienta**. Ten adres musi być **pełny** (`https://...`) i mieć domenę z `ALLOWED_ORIGINS` — na stronie najprościej `` `${window.location.origin}/...` ``. Adres względny (`"/login"`) albo brak adresu (domyślnie `"/"`) kończy się na domenie API; od 06.11 API przekierowuje wtedy jeszcze raz na `https://mobilelens.me` + ta sama ścieżka, ale bez komunikatu dla użytkownika — podawaj pełny adres.

**Rejestracja i weryfikacja**
1. `POST /api/auth/sign-up/email` `{email, password, name, username?, callbackURL: "https://mobilelens.me/login?verified=1"}` → `{token: null, user: {emailVerified: false, ...}}`. Pokaż „Sprawdź skrzynkę i kliknij link”.
2. Link z maila (ważny 24 h) → API potwierdza adres → przekierowanie na `callbackURL`. Przy błędzie: `callbackURL?error=TOKEN_EXPIRED` albo `?error=INVALID_TOKEN` — pokaż „Link wygasł, wyślij ponownie”.
3. Logowanie przed potwierdzeniem → `403 EMAIL_NOT_VERIFIED`. Przycisk „Wyślij ponownie”: `POST /api/auth/send-verification-email` `{email, callbackURL}` → `{status: true}`.
4. Po potwierdzeniu użytkownik loguje się normalnie (`sign-in/email` → token). API ustawia też ciasteczko sesji dla swojej domeny, ale strona i aplikacje używają tokenu, więc tego ciasteczka nie wykorzystują.

**Reset hasła**
1. „Nie pamiętam hasła”: `POST /api/auth/request-password-reset` `{email, redirectTo: "https://mobilelens.me/reset-password"}` → zawsze `{status: true, message}` (także gdy konta nie ma — nie da się sprawdzić, czy adres jest zarejestrowany).
2. Link z maila (ważny 1 h, jednorazowy) → przekierowanie na `redirectTo?token=XYZ`; przy złym/wygasłym linku `redirectTo?error=INVALID_TOKEN`.
3. Strona `/reset-password` czyta `token` z adresu i wysyła `POST /api/auth/reset-password` `{newPassword, token}` → `{status: true}`. Błędy: `INVALID_TOKEN` (400), `PASSWORD_TOO_WEAK` (400). Potem zwykłe logowanie.
- Zmiana znanego hasła (zalogowany): `POST /api/auth/change-password` `{currentPassword, newPassword, revokeOtherSessions?}`.

**Zmiana adresu e-mail (zalogowany)**
- `POST /api/auth/change-email` `{newEmail, callbackURL: "https://mobilelens.me/account"}`. Mail z potwierdzeniem idzie na **obecny** adres; adres zmienia się po kliknięciu linku (przekierowanie na `callbackURL`).

**Aplikacje mobilne** — linki z maili otwierają się w przeglądarce na stronie `mobilelens.me` (formularz resetu, komunikat po weryfikacji); aplikacja nie musi obsługiwać tokenów z maili. Wystarczy: przycisk „Nie pamiętam hasła” (`request-password-reset` z `redirectTo` na stronę), obsługa `EMAIL_NOT_VERIFIED` z „Wyślij ponownie” i `callbackURL` na stronę przy rejestracji. (Otwieranie linków w aplikacji — App Links / Universal Links — nie jest skonfigurowane.)

**Strona na GitHub Pages** — routing `BrowserRouter` wymaga `404.html` (kopia `index.html`, np. `"build": "vite build && cp dist/index.html dist/404.html"`), inaczej przekierowanie na `/login` albo `/reset-password` daje 404 GitHuba.

## 15. Pozostałe zmiany 31.10–06.11.2026 (skrót; szczegóły w sekcjach 3, 5, 10, 11)
- `sort=brand` (marka, potem model) i sortowanie naturalne nazw (`S8, S9, S20`, `Pixel 9, 10`) w liście, `/search` i `/api/brands`.
- Wyszukiwarka: `videoMinWidth`/`videoMinFps` w `cameras[]`, `allBackCamerasVideo`, `frontCameraCountMin`; `GET /api/smartphones/facets` z `videoMaxFpsByWidth` (progi 854/1280/1920/3840/7680) i `front`.
- Aparaty: `sensorModel`, `videoModes` edytowalne przez moderatora (PATCH), limit `fpsMax` 2000, `ois`/`afZones` mogą być `null`.
- Zdjęcia w galerii i `/upload/photos/mine`: `exifFocalLength`, `exifAperture`, `exifIso`, `exifShutterSpeed`, `exifDigitalZoom` (1–100 albo `null`; ekwiwalent 35 mm klatki = ogniskowa × crop × zoom).
- Liczby bez szumu float32 (6 cyfr znaczących; 2.4000000953 → 2.4).
- Wejście przeglądarką na domenę API poza `/api` (np. `https://mobilelens.duckdns.org/account`) → `302` na `https://mobilelens.me/account`.


## 16. Rozmiar matrycy: wartość podana vs przybliżenie (08.11.2026)
**Zasada:** `sensorFormat` = tylko wartość podana przez człowieka (specyfikacja producenta, moderator). Nigdy nie wysyłaj tam wartości wyliczonej. Przybliżenie liczy backend, jednym wzorem, i zwraca osobno.

**Nowe pola aparatu (tylko do odczytu, wszędzie, gdzie jest aparat:** szczegóły telefonu, `/compare`, `GET /api/cameras*`, `/mine`, `/pending`, odpowiedzi POST/PATCH):
- `sensorFormatApprox: string | null` — np. `"1/2.55"`, `"1/1.59"`, `"1"`, `"1.4"`.
- `sensorDenominatorApprox: number | null` — np. `2.55`.
- Przeliczane przy każdym zapisie aparatu (POST/PATCH `/cameras`, `/review`, scalanie zgłoszeń) i przy starcie serwera dla istniejących aparatów. Wysłane przez klienta są ignorowane.

**Wyświetlanie (web, Android, iOS):**
```ts
const sensorLabel = (c: Camera) =>
  c.sensorFormat ? `${c.sensorFormat}″`
  : c.sensorFormatApprox ? `≈${c.sensorFormatApprox}″`
  : "—";
```
Znak `≈` tylko przy przybliżeniu. Opcjonalnie tooltip „Przybliżenie z rozmiaru piksela i rozdzielczości”.

**Wzór (dla informacji; nie licz po stronie klienta):**
1. Przekątna matrycy:
   - jest `pixelPitchUm` i `resolutionMp`: piksele = `photoWidthPx × photoHeightPx`, jeśli ich iloczyn różni się od `resolutionMp × 10⁶` o ≤ 5 %; inaczej (np. zdjęcie binowane 12.5 MP z matrycy 50 MP) szerokość = `√(MP·10⁶·r)`, wysokość = szerokość / r, gdzie r = proporcje zdjęcia → `aspectRatio` → 4:3. Przekątna [mm] = `hypot(szer, wys) × pixelPitchUm / 1000`;
   - inaczej jest `cropFactor`: przekątna = `43.27 / cropFactor`;
   - inaczej: `null`.
2. Mianownik = `(przekątna < 8 mm ? 18 : 16) / przekątna`, zaokrąglony do 0.01.
3. Format: mianownik ≥ 1.05 → `"1/" + mianownik` (bez zbędnych zer, `"1/3.6"`); inaczej cale = 1/mianownik z 1 miejscem (`"1"`, `"1.4"`).

Przykłady: crop 6.13 → `1/2.55`; crop 8.65 → `1/3.6`; piksel 1.0 µm, 8064×6048 → `1/1.59`; 13.2×8.8 mm → `1`.

**Filtry i facety:** `SENSOR_DEN = sensorDenominator ?? sensorDenominatorApprox` w `sensor_den_min/max` (`GET /api/smartphones`), `sensorDenominatorMin/Max` w `POST /api/smartphones/search` i w `GET /api/smartphones/facets`. Wartość podana zawsze wygrywa. Zmiana względem starego `cropFactor/2.7`: np. crop 6.13 to teraz ≈2.55 (było 2.27), więc nie przechodzi już `sensorDenominatorMax: 2.3`.

**Porządki (moderator)** — nic nie jest czyszczone automatycznie:
- `GET /api/cameras/sensor-format-review` → `{data: Candidate[], total}` — zatwierdzone aparaty z `sensorFormat`, który pasuje do któregoś starego wzoru (wartość wyglądająca na wyliczoną), i którego moderator jeszcze nie sprawdzał.
  ```ts
  type Candidate = { id; smartphoneId; type; facing; sensorFormat: string; sensorFormatApprox: string | null;
    sensorDenominator: number | null; sensorDenominatorApprox: number | null; cropFactor; pixelPitchUm; resolutionMp;
    photoWidthPx; photoHeightPx; aspectRatio; matchedFormula: string; // np. "cropFactor / 2.7"
    phone: { id; modelName; brandName; ... } };
  ```
- `POST /api/cameras/:id/sensor-format-review` `{action: "confirm" | "clear"}` → `{ok: true, camera}`.
  - `confirm` — wartość jest prawdziwa (zgadza się ze specyfikacją), zostaje; aparat znika z listy.
  - `clear` — `sensorFormat` i `sensorDenominator` = `null`; od teraz pokazuje się `≈sensorFormatApprox`.
  - Błędy: `400 INVALID_FIELD` (`field: "action"`), `404 CAMERA_NOT_FOUND`, `403` dla nie-moderatora.
- Aparat znika z listy także, gdy moderator ustawi `sensorFormat` w `POST /api/cameras`, `PATCH /api/cameras/:id` albo `/review` (approved).
- Panel: tabela telefon / typ / zapisane `sensorFormat` / `≈sensorFormatApprox` / `matchedFormula` + przyciski „Potwierdź” i „Wyczyść”.

**Formularze (web, Android, iOS):**
- Pole „Rozmiar matrycy” wysyłaj tylko, gdy użytkownik je wpisał (ze specyfikacji). Nie wypełniaj go wyliczeniem z cropa/piksela.
- Panel moderatora może pokazać `≈sensorFormatApprox` jako podpowiedź obok pola, ale **nie wstawiaj** jej do pola.

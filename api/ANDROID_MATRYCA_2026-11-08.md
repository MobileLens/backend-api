# MobileLens Android — rozmiar matrycy (08.11.2026)

Instrukcja dla agenta AI pracującego nad aplikacją Android. Pełny opis: `MOBILELENS_API_FOR_FRONTEND.md`, sekcja 16.

## Co się zmieniło w backendzie
- `sensorFormat` = **tylko** wartość podana przez człowieka (specyfikacja producenta / moderator).
- Backend sam liczy przybliżenie i zwraca je w nowych polach aparatu (tylko do odczytu):
  `sensorFormatApprox: String?` (np. `"1/2.55"`) i `sensorDenominatorApprox: Double?` (np. `2.55`).
- Filtry i facety używają `sensorDenominator ?: sensorDenominatorApprox` — aplikacja nic tu nie zmienia.

## 1. OBOWIĄZKOWE: nie wysyłaj wyliczonego `sensorFormat`
Usuń kod, który liczy rozmiar matrycy (z cropa, rozmiaru piksela, rozdzielczości, `cropFactor / 2.7` itd.)
i wstawia wynik do `sensorFormat` w `POST /api/cameras`.

```kotlin
// było (przykład)
sensorFormat = sensorFormat ?: estimateSensorFormat(cropFactor, pixelPitchUm, ...)
// ma być
sensorFormat = userTypedSensorFormat?.trim()?.takeIf { it.isNotEmpty() }   // inaczej null / brak pola
```

- Wysyłaj nadal `cropFactor`, `pixelPitchUm`, `resolutionMp`, `photoWidthPx`, `photoHeightPx`, `aspectRatio` —
  z nich backend liczy przybliżenie.
- Nie wysyłaj `sensorFormatApprox` / `sensorDenominatorApprox` (backend je ignoruje).

## 2. DTO
```kotlin
data class Camera(
    // ...dotychczasowe pola...
    val sensorFormat: String? = null,
    val sensorDenominator: Double? = null,
    val sensorFormatApprox: String? = null,        // NOWE
    val sensorDenominatorApprox: Double? = null,   // NOWE
)
```

## 3. Wyświetlanie (specyfikacja, porównywarka, karta aparatu)
```kotlin
fun Camera.sensorLabel(): String = when {
    !sensorFormat.isNullOrBlank() -> "$sensorFormat″"
    !sensorFormatApprox.isNullOrBlank() -> "≈$sensorFormatApprox″"
    else -> "—"
}
```
- `≈` tylko przy przybliżeniu. Opcjonalnie podpis/tooltip „przybliżenie”.
- Porównywarka: do porównań „większa matryca” użyj `sensorDenominator ?: sensorDenominatorApprox` (mniejsza liczba = większa matryca).

## 4. Formularz zgłoszenia aparatu
- Pole „Rozmiar matrycy (opcjonalnie, ze specyfikacji)” — puste domyślnie, **bez** automatycznego wypełniania.
- Format: `1/1.28`, `1/2.55`, `1` (bez znaku cala, kropka dziesiętna). Puste = nie wysyłaj pola.

## 5. Panel moderatora (jeśli jest w aplikacji)
- Obok pola `sensorFormat` możesz pokazać podpowiedź `≈ {sensorFormatApprox}″`, ale **nie wstawiaj** jej do pola.
- Nowy ekran (opcjonalnie) „Porządki: rozmiar matrycy”:
  - `GET /api/cameras/sensor-format-review` → `{data: [...], total}` — aparaty, których `sensorFormat` wygląda na wyliczony starym wzorem.
    Pokaż: telefon (`phone.modelName`), `type`, zapisane `sensorFormat`, `≈sensorFormatApprox`, `matchedFormula`.
  - Przyciski: „Potwierdź” → `POST /api/cameras/{id}/sensor-format-review {"action":"confirm"}`,
    „Wyczyść” → `{"action":"clear"}`. Odpowiedź `{ok, camera}` → usuń wiersz z listy.

## 6. Lista kontrolna
- [ ] Usunięte wyliczanie `sensorFormat` przed wysyłką
- [ ] `Camera.sensorFormatApprox`, `Camera.sensorDenominatorApprox` w DTO (`= null`)
- [ ] `sensorLabel()` z `≈` w specyfikacji i porównywarce
- [ ] Formularz: pole matrycy puste domyślnie
- [ ] (moderator) podpowiedź bez wstawiania; ekran porządków
- [ ] Test: JSON aparatu z `"sensorFormat": null, "sensorFormatApprox": "1/2.55"` → „≈1/2.55″”

/**
 * Przybliżony rozmiar matrycy ("typ" w calach) liczony WYŁĄCZNIE przez backend, jednym wzorem.
 * camera.sensorFormat to zawsze wartość podana przez człowieka (moderator ze specyfikacji, zgłaszający,
 * który ją zna) - nigdy wyliczona. Przybliżenie jest zapisywane osobno (sensorFormatApprox).
 *
 * Przekątna (mm):
 *  a) pixelPitchUm: wymiary w pikselach x rozmiar piksela. photoWidthPx x photoHeightPx tylko wtedy, gdy ich
 *     iloczyn mieści się w 5% od resolutionMp (zdjęcie nie jest binowane); inaczej wymiary z resolutionMp
 *     i proporcji matrycy (photoWidthPx/photoHeightPx, potem aspectRatio, domyślnie 4:3).
 *  b) inaczej cropFactor: 43.27 / cropFactor.
 *  c) inaczej brak przybliżenia.
 * Mianownik = (przekątna < 8 ? 18 : 16) / przekątna (umowny "cal" optyczny), zaokrąglony do 2 miejsc.
 * Format: mianownik >= 1.05 -> "1/2.55"; inaczej 1/mianownik z 1 miejscem po przecinku -> "1", "1.1".
 */

export type SensorApproxInput = {
  pixelPitchUm?: number | null;
  resolutionMp?: number | null;
  photoWidthPx?: number | null;
  photoHeightPx?: number | null;
  aspectRatio?: string | null;
  cropFactor?: number | null;
};

export type SensorApprox = { diagonalMm: number; denominator: number; format: string };

const FULL_FRAME_DIAGONAL_MM = 43.27;

const pos = (v: number | null | undefined): v is number => typeof v === "number" && Number.isFinite(v) && v > 0;

/** "4:3" -> 1.333, "1.48:1" -> 1.48, "1.5" -> 1.5; niepoprawne -> null. */
export function parseAspectRatio(s: string | null | undefined): number | null {
  if (!s) return null;
  const parts = s.split(":").map(Number);
  const r = parts.length === 2 ? parts[0]! / parts[1]! : parts.length === 1 ? parts[0]! : NaN;
  return Number.isFinite(r) && r > 0 ? r : null;
}

/** Przekątna matrycy w mm według zasad a/b/c; null, gdy nie da się policzyć. */
export function sensorDiagonalMm(c: SensorApproxInput): number | null {
  if (pos(c.pixelPitchUm)) {
    const hasPhoto = pos(c.photoWidthPx) && pos(c.photoHeightPx);
    let w: number | null = null, h: number | null = null;
    if (hasPhoto && pos(c.resolutionMp)) {
      const photoPx = c.photoWidthPx! * c.photoHeightPx!;
      const sensorPx = c.resolutionMp * 1e6;
      if (Math.abs(photoPx - sensorPx) <= 0.05 * sensorPx) { w = c.photoWidthPx!; h = c.photoHeightPx!; }
    }
    if (w === null && pos(c.resolutionMp)) {
      const ratio = hasPhoto ? c.photoWidthPx! / c.photoHeightPx! : parseAspectRatio(c.aspectRatio) ?? 4 / 3;
      w = Math.sqrt(c.resolutionMp * 1e6 * ratio);
      h = w / ratio;
    }
    if (w === null && hasPhoto) { w = c.photoWidthPx!; h = c.photoHeightPx!; } // brak MP: jedyne, co mamy
    if (w !== null && h !== null) return (Math.hypot(w, h) * c.pixelPitchUm) / 1000;
  }
  if (pos(c.cropFactor)) return FULL_FRAME_DIAGONAL_MM / c.cropFactor;
  return null;
}

/** Zapis mianownika bez zbędnych zer: 3.60 -> "3.6", 2.55 -> "2.55", 1 -> "1". */
const trim = (n: number, decimals: number) => String(Number(n.toFixed(decimals)));

export function sensorApprox(c: SensorApproxInput): SensorApprox | null {
  const diagonalMm = sensorDiagonalMm(c);
  if (diagonalMm === null || !(diagonalMm > 0)) return null;
  const denominator = Math.round(((diagonalMm < 8 ? 18 : 16) / diagonalMm) * 100) / 100;
  if (!(denominator > 0)) return null;
  const format = denominator >= 1.05 ? `1/${trim(denominator, 2)}` : trim(1 / denominator, 1);
  return { diagonalMm, denominator, format };
}

/** Pola do zapisania w aparacie (insert/update/backfill). */
export function sensorApproxFields(c: SensorApproxInput): { sensorDenominatorApprox: number | null; sensorFormatApprox: string | null } {
  const a = sensorApprox(c);
  return { sensorDenominatorApprox: a?.denominator ?? null, sensorFormatApprox: a?.format ?? null };
}

import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { db } from "../db/index.js";
import { camera } from "../db/schema.js";
import { sensorApprox, sensorApproxFields, sensorDiagonalMm } from "../lib/sensorApprox.js";
import { sensorDenominatorOf } from "../lib/cameraSpec.js";

type CameraRow = typeof camera.$inferSelect;
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Przelicza przybliżenie dla jednego aparatu (np. po zmianie danych przez agregację). */
export function refreshSensorApprox(tx: Tx | typeof db, cameraId: string): void {
  const r = tx.select().from(camera).where(eq(camera.id, cameraId)).all()[0];
  if (!r) return;
  const f = sensorApproxFields(r);
  if (f.sensorDenominatorApprox !== r.sensorDenominatorApprox || f.sensorFormatApprox !== r.sensorFormatApprox) {
    tx.update(camera).set(f).where(eq(camera.id, cameraId)).run();
  }
}

/** Przy starcie: przybliżenie dla wszystkich aparatów (przelicza tylko te, w których coś się zmieniło). */
export function backfillSensorApprox(): number {
  return db.transaction((tx) => {
    let n = 0;
    for (const r of tx.select().from(camera).all()) {
      const f = sensorApproxFields(r);
      if (f.sensorDenominatorApprox !== r.sensorDenominatorApprox || f.sensorFormatApprox !== r.sensorFormatApprox) {
        tx.update(camera).set(f).where(eq(camera.id, r.id)).run();
        n++;
      }
    }
    return n;
  });
}

// ── porządki: sensorFormat wyliczony kiedyś przez aplikację zamiast podany przez człowieka ──────────────

/**
 * Wzory, którymi aplikacja (i dawny backend) mogły wyliczać rozmiar matrycy. Wzór starej aplikacji Android
 * nie jest tu znany z kodu, więc lista obejmuje warianty spotykane w praktyce; zgodność oznacza tylko
 * "podejrzany" - decyzję zawsze podejmuje moderator.
 */
const OLD_FORMULAS: { name: string; denominator: (r: CameraRow) => number | null }[] = [
  { name: "backend-approx (18/16 mm per inch)", denominator: (r) => sensorApprox(r)?.denominator ?? null },
  { name: "cropFactor / 2.7", denominator: (r) => (r.cropFactor > 0 ? r.cropFactor / 2.7 : null) },
  { name: "16 mm per inch (pixels x pitch)", denominator: (r) => perInch(sensorDiagonalMm({ ...r, cropFactor: null }), 16) },
  { name: "18 mm per inch (pixels x pitch)", denominator: (r) => perInch(sensorDiagonalMm({ ...r, cropFactor: null }), 18) },
  { name: "16 mm per inch (43.27 / crop)", denominator: (r) => perInch(r.cropFactor > 0 ? 43.27 / r.cropFactor : null, 16) },
  { name: "18 mm per inch (43.27 / crop)", denominator: (r) => perInch(r.cropFactor > 0 ? 43.27 / r.cropFactor : null, 18) },
];

function perInch(diagonalMm: number | null, mmPerInch: number): number | null {
  return diagonalMm && diagonalMm > 0 ? mmPerInch / diagonalMm : null;
}

/** Liczba miejsc po przecinku w zapisanym formacie ("1/2.55" -> 2, "1/3.6" -> 1, "1" -> 0). */
function decimalsOf(format: string): number {
  const num = format.startsWith("1/") ? format.slice(2) : format;
  const dot = num.indexOf(".");
  return dot < 0 ? 0 : num.length - dot - 1;
}

/** Czy zapisany sensorFormat wygląda na wyliczony danym wzorem (równy po zaokrągleniu do tej samej precyzji). */
export function matchedFormula(r: CameraRow): string | null {
  if (!r.sensorFormat) return null;
  const stored = sensorDenominatorOf(r.sensorFormat);
  if (stored === null) return null;
  const isFraction = r.sensorFormat.startsWith("1/");
  const dec = decimalsOf(r.sensorFormat);
  for (const f of OLD_FORMULAS) {
    const d = f.denominator(r);
    if (d === null || !(d > 0)) continue;
    // porównanie w tej samej postaci, w jakiej zapisano wartość: mianownik ("1/x") albo cale ("x")
    const same = isFraction
      ? Number(d.toFixed(dec)) === Number(r.sensorFormat.slice(2))
      : Number((1 / d).toFixed(dec)) === Number(r.sensorFormat);
    if (same) return f.name;
  }
  return null;
}

export type SensorFormatCandidate = {
  id: string; smartphoneId: string; type: string; facing: string;
  sensorFormat: string; sensorFormatApprox: string | null;
  sensorDenominator: number | null; sensorDenominatorApprox: number | null;
  cropFactor: number; pixelPitchUm: number; resolutionMp: number;
  photoWidthPx: number | null; photoHeightPx: number | null; aspectRatio: string | null;
  matchedFormula: string;
};

/** Zatwierdzone aparaty, których sensorFormat wygląda na wyliczony i nie był sprawdzony przez moderatora. */
export function sensorFormatCandidates(): SensorFormatCandidate[] {
  const rows = db.select().from(camera)
    .where(and(eq(camera.status, "approved"), isNotNull(camera.sensorFormat), isNull(camera.sensorFormatReviewedAt))).all();
  const out: SensorFormatCandidate[] = [];
  for (const r of rows) {
    const m = matchedFormula(r);
    if (!m) continue;
    out.push({
      id: r.id, smartphoneId: r.smartphoneId, type: r.type, facing: r.facing,
      sensorFormat: r.sensorFormat!, sensorFormatApprox: r.sensorFormatApprox,
      sensorDenominator: r.sensorDenominator, sensorDenominatorApprox: r.sensorDenominatorApprox,
      cropFactor: r.cropFactor, pixelPitchUm: r.pixelPitchUm, resolutionMp: r.resolutionMp,
      photoWidthPx: r.photoWidthPx, photoHeightPx: r.photoHeightPx, aspectRatio: r.aspectRatio,
      matchedFormula: m,
    });
  }
  return out;
}

/**
 * Camera aggregation pipeline (plan section 4).
 *
 * Runs periodically on the pending camera rows.
 * Groups by (smartphone_id, type, facing), computes median/mode,
 * promotes one row to approved and rejects duplicates.
 */

import { db } from "../db/index.js";
import { camera } from "../db/schema.js";
import { eq } from "drizzle-orm";

// Minimum submissions before auto-approval
const MIN_SUBMISSIONS = 3;
// Maximum allowed relative deviation before a value is considered an outlier (20%)
const OUTLIER_THRESHOLD = 0.20;
// Minimum agreement fraction required for auto-approval
const MIN_AGREEMENT = 0.66;

type CameraRow = typeof camera.$inferSelect;
type NumericKey = "focalLengthMm" | "aperture" | "cropFactor" | "pixelPitchUm" | "resolutionMp" | "activeResolutionMp";
type DiscreteKey = "afZones" | "ois";

const NUMERIC_KEYS: NumericKey[] = [
  "focalLengthMm", "aperture", "cropFactor",
  "pixelPitchUm", "resolutionMp", "activeResolutionMp",
];

const DISCRETE_KEYS: DiscreteKey[] = ["afZones", "ois"];

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[mid - 1]! + sorted[mid]!) / 2)
    : sorted[mid]!;
}

function mode<T extends string | number>(values: T[]): T {
  const freq = new Map<T, number>();
  for (const v of values) freq.set(v, (freq.get(v) ?? 0) + 1);
  let best = values[0] as T;
  let bestCount = 0;
  for (const [v, count] of freq) {
    if (count > bestCount) { best = v; bestCount = count; }
  }
  return best;
}

/** Reject rows whose numeric values deviate > OUTLIER_THRESHOLD from the group median */
function findOutliers(rows: CameraRow[]): Set<string> {
  const outlierIds = new Set<string>();

  for (const key of NUMERIC_KEYS) {
    const values = rows.map(r => r[key] as number);
    const med = median(values);
    if (med === 0) continue;

    for (const row of rows) {
      const val = row[key] as number;
      if (Math.abs(val - med) / med > OUTLIER_THRESHOLD) {
        outlierIds.add(row.id);
      }
    }
  }
  return outlierIds;
}

/** Compute agreement: fraction of rows matching the modal value across all discrete fields */
function agreementScore(rows: CameraRow[]): number {
  if (rows.length === 0) return 0;
  let totalChecks = 0;
  let matching = 0;

  for (const key of DISCRETE_KEYS) {
    const values = rows.map(r => r[key]);
    const modeVal = mode(values);
    for (const v of values) {
      totalChecks++;
      if (v === modeVal) matching++;
    }
  }
  return totalChecks === 0 ? 1 : matching / totalChecks;
}

async function aggregateGroup(rows: CameraRow[]) {
  if (rows.length < MIN_SUBMISSIONS) {
    // Not enough data — leave pending for moderator
    return;
  }

  const outlierIds = findOutliers(rows);
  const cleanRows = rows.filter(r => !outlierIds.has(r.id));

  // Cała grupa jest teraz aktualizowana w jednej transakcji. Wcześniej
  // odrzucenie outlierów i promocja zwycięzcy były osobnymi zapytaniami —
  // awaria w środku (np. crash procesu) potrafiła zostawić grupę w
  // niespójnym stanie (część już odrzucona, reszta nietknięta).
  await db.transaction(async (tx) => {
    // Reject outlier rows automatically
    for (const id of outlierIds) {
      await tx.update(camera)
        .set({ status: "rejected", reviewedAt: new Date(), reviewedBy: null })
        .where(eq(camera.id, id));
    }

    if (cleanRows.length < MIN_SUBMISSIONS) {
      // After outlier removal, too few remain — leave rest pending
      return;
    }

    const agreement = agreementScore(cleanRows);
    if (agreement < MIN_AGREEMENT) {
      // Low consensus — leave for manual moderation
      return;
    }

    const consensusNumeric: Partial<Record<NumericKey, number>> = {};
    for (const key of NUMERIC_KEYS) {
      const values = cleanRows.map(r => r[key] as number);
      consensusNumeric[key] = Math.round(median(values) * 100) / 100;
    }

    const consensusDiscrete: { afZones: number; ois: CameraRow["ois"] } = {
      afZones: mode(cleanRows.map(r => r.afZones)),
      ois:     mode(cleanRows.map(r => r.ois)),
    };

    // Promote first (oldest) row to approved with consensus values.
    // Sortujemy kopię, żeby nie modyfikować w miejscu tablicy wejściowej.
    const sorted = [...cleanRows].sort(
      (a, b) => a.submittedAt.getTime() - b.submittedAt.getTime()
    );
    const winner = sorted[0]!;

    await tx.update(camera)
      .set({
        status:     "approved",
        reviewedAt: new Date(),
        reviewedBy: null,
        ...consensusNumeric,
        ...consensusDiscrete,
      })
      .where(eq(camera.id, winner.id));

    // Reject the rest of the clean group as duplicate
    const losers = sorted.filter(r => r.id !== winner.id);
    for (const row of losers) {
      await tx.update(camera)
        .set({ status: "rejected", reviewedAt: new Date(), reviewedBy: null })
        .where(eq(camera.id, row.id));
    }
  });
}

export async function runAggregationPipeline() {
  // Fetch all pending camera rows
  const pendingRows = await db.select()
    .from(camera)
    .where(eq(camera.status, "pending"));

  if (pendingRows.length === 0) return;

  // Group by (smartphone_id, type, facing)
  const groups = new Map<string, CameraRow[]>();
  for (const row of pendingRows) {
    const key = `${row.smartphoneId}::${row.type}::${row.facing}`;
    const existing = groups.get(key) ?? [];
    existing.push(row);
    groups.set(key, existing);
  }

  for (const [, rows] of groups) {
    try {
      await aggregateGroup(rows);
    } catch (err) {
      console.error("[aggregation] group error:", err);
    }
  }

  console.log(`[aggregation] processed ${groups.size} groups from ${pendingRows.length} pending rows`);
}

/**
 * Uruchamia pipeline cyklicznie. Wcześniej używał setInterval, co przy
 * wolniejszym przebiegu (np. więcej danych w przyszłości) mogło odpalić
 * kolejny przebieg zanim poprzedni się skończył — dwa przebiegi mogłyby
 * złapać te same wiersze pending. Teraz kolejne uruchomienie jest
 * planowane dopiero PO zakończeniu poprzedniego (rekurencyjny setTimeout),
 * więc przebiegi nigdy się nie nakładają.
 */
export function startAggregationScheduler(intervalMs = 10 * 60 * 1000) {
  console.log("[aggregation] scheduler started, interval:", intervalMs / 1000, "s");

  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const tick = async () => {
    try {
      await runAggregationPipeline();
    } catch (err) {
      console.error("[aggregation] pipeline error:", err);
    } finally {
      if (!stopped) timer = setTimeout(tick, intervalMs);
    }
  };

  void tick(); // uruchom raz od razu przy starcie

  // funkcja do zatrzymania schedulera (np. w testach / graceful shutdown)
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}

// Bar and per-side weight maths. Pure: no React, network or storage.
// Convention (ADR-002): the logged weight is the TOTAL in kg, including the bar.

const MAX_PRECISION_FACTOR = 100; // weights are stored with up to 2 decimals

export function roundKg(kg: number): number {
  // toPrecision drops binary noise first, so 1.005 (stored as 1.00499999…) rounds up to 1.01.
  return Math.round(Number((kg * MAX_PRECISION_FACTOR).toPrecision(12))) / MAX_PRECISION_FACTOR;
}

function assertValidKg(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be a finite, non-negative number of kg (got ${value})`);
  }
}

/** total = bar + 2 × per side, rounded to 2 decimals. */
export function totalFromPerSide(barKg: number, perSideKg: number): number {
  assertValidKg(barKg, 'barKg');
  assertValidKg(perSideKg, 'perSideKg');
  return roundKg(barKg + 2 * perSideKg);
}

/** 1 lb in kg (exact definition). */
export const LB_TO_KG = 0.45359237;

/** Converts a weight to kg, rounded to 2 decimals. */
export function toKg(value: number, unit: 'kg' | 'lb'): number {
  assertValidKg(value, 'value');
  return roundKg(unit === 'kg' ? value : value * LB_TO_KG);
}

/** Converts kg to lb, rounded to 2 decimals. */
export function kgToLb(kg: number): number {
  assertValidKg(kg, 'kg');
  return roundKg(kg / LB_TO_KG);
}

/**
 * Weight on each side of the bar for a given total, rounded to 2 decimals.
 * Returns null when the total is below the bar, because that is impossible as a total.
 */
export function perSideFromTotal(totalKg: number, barKg: number): number | null {
  assertValidKg(totalKg, 'totalKg');
  assertValidKg(barKg, 'barKg');
  if (totalKg < barKg) return null;
  return roundKg((totalKg - barKg) / 2);
}

export type WeightBreakdown = { totalKg: number; barKg: number; perSideKg: number };

/** The "60 kg = 15 kg bar + 22.5 kg each side" numbers, or null when the total is below the bar. */
export function weightBreakdown(totalKg: number, barKg: number): WeightBreakdown | null {
  const perSideKg = perSideFromTotal(totalKg, barKg);
  return perSideKg === null
    ? null
    : { totalKg: roundKg(totalKg), barKg: roundKg(barKg), perSideKg };
}

/** True when value is a whole multiple of step, tolerating floating point noise. */
export function isMultipleOf(value: number, step: number): boolean {
  const ratio = value / step;
  return Math.abs(ratio - Math.round(ratio)) < 1e-9;
}

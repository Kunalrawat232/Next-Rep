// Bar and per-side weight maths. Pure: no React, network or storage.
// Convention (ADR-002): the logged weight is the TOTAL in kg, including the bar.

const MAX_PRECISION_FACTOR = 100; // weights are stored with up to 2 decimals

export function roundKg(kg: number): number {
  return Math.round(kg * MAX_PRECISION_FACTOR) / MAX_PRECISION_FACTOR;
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

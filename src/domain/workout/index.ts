import {
  PER_SIDE_KG_RANGE,
  TOTAL_KG_RANGE,
  usesBar,
  type EquipmentType,
  type InputMode,
  type Unit,
} from '../schemas';
import {
  ENTRY_STEP,
  fieldFromKg,
  fieldFromText,
  formatWeight,
  fromDisplay,
  maxDisplay,
  toDisplay,
  unitLabel,
  type WeightField,
} from '../units';
import { roundKg } from '../weight';

export type EntryMode = 'total' | 'per_side';

/** How far one tap on + or - moves the weight, in the user's unit: the smallest plate pair, or the larger step for everything else. */
export function stepFor(equipment: EquipmentType, mode: EntryMode, unit: Unit): number {
  return ENTRY_STEP[usesBar(equipment) && mode === 'per_side' ? 'per_side' : 'total'][unit];
}

/** One step up or down, landing on a multiple of the step, within what the database allows (shown in the user's unit). */
export function nextValue(
  current: number,
  step: number,
  direction: 1 | -1,
  mode: EntryMode,
  unit: Unit,
): number {
  const max = maxDisplay(mode === 'per_side' ? PER_SIDE_KG_RANGE.max : TOTAL_KG_RANGE.max, unit);
  const steps = current / step;
  // From a value between two steps, the first tap goes to the next step in that direction.
  const target = direction === 1 ? Math.floor(steps + 1e-9) + 1 : Math.ceil(steps - 1e-9) - 1;
  return Math.min(max, Math.max(0, roundKg(target * step)));
}

export function weightHint(equipment: EquipmentType): string {
  switch (equipment) {
    case 'barbell':
    case 'ez_bar':
    case 'smith':
      return 'Log the total including the bar.';
    case 'dumbbell':
      return 'Log one dumbbell.';
    case 'machine':
    case 'cable':
      return 'Log the stack weight.';
    case 'bodyweight':
      return 'Log only the weight you add.';
  }
}

type Weights = { totalKg: number; barKg: number | null; perSideKg: number | null };

/**
 * The weight on each side of the bar, as shown, or null when there is none to show.
 * - kg: the stored per-side weight, which exists only when the kg maths is exact at 2 decimals.
 * - lb: worked out from the shown total and bar. Totals in lb are mostly multiples of 5, which in
 *   kg are rarely exact, so the stored value would often be missing and "45 lb each side" lost.
 */
export function perSideShown(weights: Weights, unit: Unit): number | null {
  if (weights.barKg === null) return null;
  if (unit === 'kg') return weights.perSideKg === null ? null : toDisplay(weights.perSideKg, 'kg');
  const side = roundKg((toDisplay(weights.totalKg, 'lb') - toDisplay(weights.barKg, 'lb')) / 2);
  return side < 0 ? null : side;
}

export type Breakdown = { lines: { label: string; value: string }[]; total: string };

const shown = (value: number, unit: Unit) => `${roundKg(value)} ${unitLabel(unit)}`;

/** "20 kg each side × 2, + bar 20 kg, total 60 kg": how a weight is made up. */
export function breakdownFor(weights: Weights, unit: Unit): Breakdown {
  const { totalKg, barKg } = weights;
  const total = `${formatWeight(totalKg, unit)} ${unitLabel(unit)}`;
  if (barKg === null) return { lines: [], total };
  const side = perSideShown(weights, unit);
  const plates = roundKg(toDisplay(totalKg, unit) - toDisplay(barKg, unit));
  const lines =
    side === null
      ? [{ label: 'Plates', value: shown(plates, unit) }]
      : [
          {
            label: `${shown(side, unit)} each side × 2`,
            value: shown(roundKg(2 * side), unit),
          },
        ];
  lines.push({ label: '+ bar', value: `${formatWeight(barKg, unit)} ${unitLabel(unit)}` });
  return { lines, total };
}

/** A logged set in two lines: "60 kg × 8" and "15 kg bar + 22.5 kg each side". */
export function setSummary(
  set: Weights & { reps: number },
  unit: Unit,
): { headline: string; detail: string | null } {
  const label = unitLabel(unit);
  const headline = `${formatWeight(set.totalKg, unit)} ${label} × ${set.reps}`;
  if (set.barKg === null) return { headline, detail: null };
  const side = perSideShown(set, unit);
  const plates = roundKg(toDisplay(set.totalKg, unit) - toDisplay(set.barKg, unit));
  // A total below its own bar cannot be loaded as plates: say only what the bar is.
  if (plates < 0) return { headline, detail: `${formatWeight(set.barKg, unit)} ${label} bar` };
  const rest = side === null ? `${plates} ${label} plates` : `${side} ${label} each side`;
  return { headline, detail: `${formatWeight(set.barKg, unit)} ${label} bar + ${rest}` };
}

/** Where the steppers start: the last set of this exercise, entered the way it was last time. */
export function initialEntry(
  equipment: EquipmentType,
  last: (Weights & { inputMode: InputMode; reps: number }) | undefined,
  unit: Unit,
): { mode: EntryMode; weight: WeightField; reps: number } {
  if (!last) return { mode: 'total', weight: fieldFromText(''), reps: 8 };
  if (usesBar(equipment) && last.inputMode === 'per_side') {
    const side = perSideShown(last, unit);
    if (side !== null)
      return {
        mode: 'per_side',
        // In kg the stored per-side weight is exact, so the field remembers it. In lb it is worked out.
        weight:
          unit === 'kg' && last.perSideKg !== null
            ? fieldFromKg(last.perSideKg, unit)
            : fieldFromText(String(side)),
        reps: last.reps,
      };
  }
  return { mode: 'total', weight: fieldFromKg(last.totalKg, unit), reps: last.reps };
}

/**
 * What the validator is given for a typed weight, always as kg, with the mode it should read it in.
 * In lb:
 * - A weight per side is added up in lb first (bar + 2 × side), then converted once, so the same
 *   weight typed as a total or per side stores the same kg. Converting each part and adding them in
 *   kg can land 0.01 kg apart, which would show as a record for an equal weight.
 * - Left untouched, the weight is the stored total it started from (`untouchedTotalKg`), whichever
 *   way it was entered: 60 kg is shown as 132.3 lb, which would convert to 60.01 kg.
 * - A weight that shows the same as the bar is the bar: 7.5 kg shows as 16.5 lb, which converts to
 *   7.48 kg, "below the bar", and 15 kg shows as 33.1 lb, which is 15.01 kg.
 */
export function weightForValidation(
  entry: {
    mode: EntryMode;
    /** What is typed, in kg. */
    valueKg: number;
    /** What is typed, in the unit shown (a weight per side can have 2 decimals, more than the unit's own display). */
    valueShown: number;
    barKg: number | null;
    /** The stored total the field started from, when the weight and mode are as they were at the start. */
    untouchedTotalKg?: number;
  },
  unit: Unit,
): { kg: number; mode: EntryMode } {
  if (unit !== 'lb') return { kg: entry.valueKg, mode: entry.mode };
  if (entry.untouchedTotalKg !== undefined) return { kg: entry.untouchedTotalKg, mode: 'total' };
  const bar = entry.barKg;
  if (bar === null) return { kg: entry.valueKg, mode: entry.mode };
  const kg =
    entry.mode === 'per_side'
      ? fromDisplay(roundKg(toDisplay(bar, 'lb') + 2 * entry.valueShown), 'lb')
      : entry.valueKg;
  const snapped = toDisplay(kg, 'lb') === toDisplay(bar, 'lb') ? bar : kg;
  return { kg: snapped, mode: entry.mode === 'per_side' ? 'total' : entry.mode };
}

/**
 * Switching between a total and a weight per side keeps the same real weight on the bar. The
 * numbers are worked out in the unit shown, with the bar as shown. A total less than the bar has no
 * weight per side, so null.
 */
export function convertEntry(
  value: number,
  from: EntryMode,
  barKg: number,
  unit: Unit,
): number | null {
  const bar = toDisplay(barKg, unit);
  if (from === 'per_side') return roundKg(value * 2 + bar);
  return value >= bar ? roundKg((value - bar) / 2) : null;
}

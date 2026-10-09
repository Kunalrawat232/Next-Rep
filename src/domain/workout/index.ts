import { formatKg } from '../gyms';
import {
  PER_SIDE_KG_RANGE,
  TOTAL_KG_RANGE,
  usesBar,
  type EquipmentType,
  type InputMode,
} from '../schemas';
import { roundKg } from '../weight';

export type EntryMode = 'total' | 'per_side';

/** Only equipment with a bar has the choice between a total and a weight per side. */
export const usesModeToggle = (equipment: EquipmentType): boolean => usesBar(equipment);

/** How far one tap on + or - moves the weight: the smallest plate pair, or 2.5 kg for everything else. */
export function stepFor(equipment: EquipmentType, mode: EntryMode): number {
  return usesBar(equipment) && mode === 'per_side' ? 1.25 : 2.5;
}

/** One step up or down, landing on a multiple of the step, within what the database allows. */
export function nextValue(
  current: number,
  step: number,
  direction: 1 | -1,
  mode: EntryMode,
): number {
  const max = mode === 'per_side' ? PER_SIDE_KG_RANGE.max : TOTAL_KG_RANGE.max;
  const steps = current / step;
  // From a value between two steps, the first tap goes to the next step in that direction.
  const target = direction === 1 ? Math.floor(steps + 1e-9) + 1 : Math.ceil(steps - 1e-9) - 1;
  return Math.min(max, Math.max(0, roundKg(target * step)));
}

const PLAIN_NUMBER = /^(\d+\.?\d*|\.\d+)$/;
const COMMA_DECIMAL = /^\d*,\d{1,2}$/;

/** A typed weight in kg, rounded to 2 decimals, or null if it is not a plain number. "62,5" is 62.5; "1,000" is refused. */
export function parseWeight(text: string): number | null {
  const typed = text.trim();
  const normal = COMMA_DECIMAL.test(typed) ? typed.replace(',', '.') : typed;
  if (!PLAIN_NUMBER.test(normal)) return null;
  const kg = roundKg(Number(normal));
  return Number.isFinite(kg) ? kg : null;
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

export type Breakdown = { lines: { label: string; value: string }[]; total: string };

/** "20 kg each side × 2, + bar 20 kg, total 60 kg": how a weight is made up. */
export function breakdownFor({ totalKg, barKg, perSideKg }: Weights): Breakdown {
  const total = `${formatKg(totalKg)} kg`;
  if (barKg === null) return { lines: [], total };
  const lines =
    perSideKg === null
      ? [{ label: 'Plates', value: `${formatKg(roundKg(totalKg - barKg))} kg` }]
      : [
          {
            label: `${formatKg(perSideKg)} kg each side × 2`,
            value: `${formatKg(roundKg(2 * perSideKg))} kg`,
          },
        ];
  lines.push({ label: '+ bar', value: `${formatKg(barKg)} kg` });
  return { lines, total };
}

/** A logged set in two lines: "60 kg × 8" and "15 kg bar + 22.5 kg each side". */
export function setSummary(set: Weights & { reps: number }): {
  headline: string;
  detail: string | null;
} {
  const headline = `${formatKg(set.totalKg)} kg × ${set.reps}`;
  if (set.barKg === null) return { headline, detail: null };
  const rest =
    set.perSideKg === null
      ? `${formatKg(roundKg(set.totalKg - set.barKg))} kg plates`
      : `${formatKg(set.perSideKg)} kg each side`;
  return { headline, detail: `${formatKg(set.barKg)} kg bar + ${rest}` };
}

/** Where the steppers start: the last set of this exercise, entered the way it was last time. */
export function initialEntry(
  equipment: EquipmentType,
  last: (Weights & { inputMode: InputMode; reps: number }) | undefined,
): { mode: EntryMode; weight: number; reps: number } {
  if (!last) return { mode: 'total', weight: 0, reps: 8 };
  const perSide = usesBar(equipment) && last.inputMode === 'per_side' && last.perSideKg !== null;
  return perSide
    ? { mode: 'per_side', weight: last.perSideKg!, reps: last.reps }
    : { mode: 'total', weight: last.totalKg, reps: last.reps };
}

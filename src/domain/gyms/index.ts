import { BAR_KG_RANGE, type EquipmentType, type Unit } from '../schemas';
import { cleanName, nameKey } from '../text';
import { formatWeight, kgFromField, maxDisplay, unitLabel, withUnit } from '../units';

export const GYM_NAME_MAX = 80;
export const BAR_NAME_MAX = 60;

/** `ez_bar` and `smith` are looked up by exercise equipment; `other` bars are manual overrides only. */
export type BarKind = 'ez_bar' | 'smith' | 'other';

export type Bar = { id: string; name: string; weightKg: number; kind: BarKind };

export type Gym = {
  id: string;
  name: string;
  /** The barbell, kept on the gym itself. Other bars are in `bars`. */
  barbellKg: number;
  isDefault: boolean;
  createdAt: string;
  bars: Bar[];
};

/** What the form holds: weights are still text, as typed. */
export type GymForm = {
  name: string;
  barbellKg: string;
  /** The stored kg the barbell field started from, so saving it untouched changes nothing (see `WeightField`). */
  barbellOrigin?: number | null;
  bars: { id?: string; name: string; weightKg: string; origin?: number | null; kind: BarKind }[];
};

export type GymInput = {
  name: string;
  barbellKg: number;
  bars: { id?: string; name: string; weightKg: number; kind: BarKind }[];
};

export type GymFormErrors = {
  name?: string;
  barbellKg?: string;
  bars: Record<number, { name?: string; weightKg?: string }>;
};

export type GymFormResult = { ok: true; value: GymInput } | { ok: false; errors: GymFormErrors };

/** Reads a weight typed in the user's unit into kg (2 decimals), or says what is wrong with it, in that unit. */
function readWeight(text: string, origin: number | null | undefined, unit: Unit): number | string {
  if (text.trim() === '') return `Enter a weight in ${unitLabel(unit)}.`;
  const outOfRange = `Use a weight between ${formatWeight(BAR_KG_RANGE.min, unit)} and ${maxDisplay(BAR_KG_RANGE.max, unit)} ${unitLabel(unit)}.`;
  const kg = kgFromField({ text, origin: origin ?? null }, unit);
  // Digits so many that the number is too big to hold are still a number: it is just out of range.
  if (kg === null)
    return /^\d+\.?\d*$/.test(text.trim()) ? outOfRange : 'Use numbers only, for example 7.5.';
  return kg < BAR_KG_RANGE.min || kg > BAR_KG_RANGE.max ? outOfRange : kg;
}

/** Checks the form. Weights are typed in `unit` and come back as kg. */
export function validateGymForm(form: GymForm, unit: Unit): GymFormResult {
  const errors: GymFormErrors = { bars: {} };
  const name = cleanName(form.name);
  if (name === '') errors.name = 'Give the gym a name.';
  else if (name.length > GYM_NAME_MAX) errors.name = `Use ${GYM_NAME_MAX} characters or fewer.`;

  const barbell = readWeight(form.barbellKg, form.barbellOrigin, unit);
  if (typeof barbell === 'string') errors.barbellKg = barbell;

  const bars: GymInput['bars'] = [];
  const seenNames = new Set<string>();
  const seenKinds = new Set<BarKind>();
  form.bars.forEach((entry, index) => {
    const problems: { name?: string; weightKg?: string } = {};
    const barName = cleanName(entry.name);
    if (barName === '') problems.name = 'Give the bar a name.';
    else if (barName.length > BAR_NAME_MAX)
      problems.name = `Use ${BAR_NAME_MAX} characters or fewer.`;
    else if (seenNames.has(nameKey(barName)))
      problems.name = 'A bar with this name already exists.';
    else if (entry.kind !== 'other' && seenKinds.has(entry.kind))
      problems.name = 'This gym already has that kind of bar.';
    // Only a bar with a usable name takes up its name and kind, so the culprit is the one flagged.
    if (!problems.name) {
      seenNames.add(nameKey(barName));
      seenKinds.add(entry.kind);
    }

    const weight = readWeight(entry.weightKg, entry.origin, unit);
    if (typeof weight === 'string') problems.weightKg = weight;

    if (problems.name || problems.weightKg) errors.bars[index] = problems;
    else if (typeof weight === 'number')
      bars.push({ id: entry.id, name: barName, weightKg: weight, kind: entry.kind });
  });

  const failed = errors.name || errors.barbellKg || Object.keys(errors.bars).length > 0;
  if (failed || typeof barbell !== 'number') return { ok: false, errors };
  return { ok: true, value: { name, barbellKg: barbell, bars } };
}

export function summarizeBars(gym: Gym, unit: Unit): string {
  return [`Barbell ${withUnit(gym.barbellKg, unit)}`]
    .concat(gym.bars.map((bar) => `${bar.name} ${withUnit(bar.weightKg, unit)}`))
    .join(' · ');
}

/** The gym marked default, else the oldest, so "no default" is never a dead end. */
export function pickDefaultGym(gyms: readonly Gym[]): Gym | undefined {
  const marked = gyms.find((gym) => gym.isDefault);
  if (marked) return marked;
  const time = (gym: Gym) => Date.parse(gym.createdAt) || 0;
  return [...gyms].sort((a, b) => time(a) - time(b))[0];
}

/** The bar an exercise uses in this gym, or undefined when the gym has none for it (ask the user). */
export function barFor(
  gym: Pick<Gym, 'barbellKg' | 'bars'>,
  equipment: EquipmentType,
): number | undefined {
  if (equipment === 'barbell') return gym.barbellKg;
  if (equipment === 'ez_bar' || equipment === 'smith')
    return gym.bars.find((bar) => bar.kind === equipment)?.weightKg;
  return undefined;
}

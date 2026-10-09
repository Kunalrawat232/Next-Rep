import { BAR_KG_RANGE, type EquipmentType } from '../schemas';
import { cleanName, nameKey } from '../text';
import { roundKg } from '../weight';

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
  bars: { id?: string; name: string; weightKg: string; kind: BarKind }[];
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

const PLAIN_NUMBER = /^(\d+\.?\d*|\.\d+)$/;
// A comma is a decimal point only in the form "7,5" or "20,25". "1,000" is a thousands separator
// and would otherwise be stored as 1 kg, so it is refused.
const COMMA_DECIMAL = /^\d*,\d{1,2}$/;

/** Reads a typed weight into kg rounded to 2 decimals. */
function readKg(text: string): number | string {
  const typed = text.trim();
  if (typed === '') return 'Enter a weight in kg.';
  const trimmed = COMMA_DECIMAL.test(typed) ? typed.replace(',', '.') : typed;
  if (!PLAIN_NUMBER.test(trimmed)) return 'Use numbers only, for example 7.5.';
  const kg = roundKg(Number(trimmed));
  if (kg < BAR_KG_RANGE.min || kg > BAR_KG_RANGE.max)
    return `Use a weight between ${BAR_KG_RANGE.min} and ${BAR_KG_RANGE.max} kg.`;
  return kg;
}

export function validateGymForm(form: GymForm): GymFormResult {
  const errors: GymFormErrors = { bars: {} };
  const name = cleanName(form.name);
  if (name === '') errors.name = 'Give the gym a name.';
  else if (name.length > GYM_NAME_MAX) errors.name = `Use ${GYM_NAME_MAX} characters or fewer.`;

  const barbell = readKg(form.barbellKg);
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

    const weight = readKg(entry.weightKg);
    if (typeof weight === 'string') problems.weightKg = weight;

    if (problems.name || problems.weightKg) errors.bars[index] = problems;
    else if (typeof weight === 'number')
      bars.push({ id: entry.id, name: barName, weightKg: weight, kind: entry.kind });
  });

  const failed = errors.name || errors.barbellKg || Object.keys(errors.bars).length > 0;
  if (failed || typeof barbell !== 'number') return { ok: false, errors };
  return { ok: true, value: { name, barbellKg: barbell, bars } };
}

/** 15 -> "15", 7.5 -> "7.5": no trailing zeros. */
export function formatKg(kg: number): string {
  return String(roundKg(kg));
}

export function summarizeBars(gym: Gym): string {
  return [`Barbell ${formatKg(gym.barbellKg)} kg`]
    .concat(gym.bars.map((bar) => `${bar.name} ${formatKg(bar.weightKg)} kg`))
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
export function barFor(gym: Gym, equipment: EquipmentType): number | undefined {
  if (equipment === 'barbell') return gym.barbellKg;
  if (equipment === 'ez_bar' || equipment === 'smith')
    return gym.bars.find((bar) => bar.kind === equipment)?.weightKg;
  return undefined;
}

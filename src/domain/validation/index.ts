// Plausibility rules for a candidate set, run before the confirmation card. Pure: no React,
// network or storage. Speech and Gemini output are untrusted; nothing is saved without passing
// through here and being shown to the user. Rules: docs/domain/weight-rules.md. Thresholds: ./config.
import { usesBar, type EquipmentType, type InputMode, type Unit } from '../schemas';
import { isMultipleOf, perSideFromTotal, roundKg, toKg } from '../weight';
import { formatWeight, maxDisplay, toDisplay, withUnit } from '../units';
import { VALIDATION_CONFIG } from './config';

export type WeightMode = 'total' | 'per_side' | 'unspecified';

export type SetCandidate = {
  equipment: EquipmentType;
  /** The weight as spoken or typed, in the given unit. */
  weight: { value: number; unit: Unit; mode: WeightMode };
  reps: number;
  /** Bar weight for this exercise (gym default or override); ignored for equipment without a bar. */
  barKg: number | null;
  /**
   * Where the number came from. Speech can mishear, so a voice number may get "did you mean ...?"
   * questions. A number the user tapped was chosen on purpose and never does. Voice when missing.
   */
  source?: 'tap' | 'voice';
};

export type ValidationContext = {
  /** The unit to write weights in, in messages and options. The unit of the typed weight when missing. */
  displayUnit?: Unit;
  /** Total of the same exercise in the last session, in kg. Missing or not positive means no history. */
  lastTotalKg?: number;
};

/** What would be stored: the total plus a breakdown, in kg. */
export type ResolvedWeight = {
  totalKg: number;
  barKg: number | null;
  perSideKg: number | null;
  inputMode: Extract<InputMode, 'total' | 'per_side'>;
};

export type IssueCode =
  | 'INVALID_NUMBER'
  | 'REPS_OUT_OF_RANGE'
  | 'WEIGHT_OUT_OF_RANGE'
  | 'PER_SIDE_OUT_OF_RANGE'
  | 'MISSING_BAR'
  | 'TOTAL_BELOW_BAR'
  | 'LARGE_JUMP'
  | 'PER_SIDE_PLAUSIBLE'
  | 'CONFUSABLE_NUMBER'
  | 'PLATE_INCREMENT'
  | 'PER_SIDE_IGNORED';

export type Issue = { code: IssueCode; message: string };

export type OptionKind = 'per_side' | 'total_no_bar' | 'confusable' | 'as_said';
export type Option = { kind: OptionKind; label: string; resolved: ResolvedWeight };

export type ValidationResult =
  | { status: 'ok'; resolved: ResolvedWeight; issues: [] }
  | { status: 'warn'; resolved: ResolvedWeight; issues: Issue[] }
  | { status: 'ask'; options: Option[]; issues: Issue[] }
  | { status: 'reject'; issues: Issue[] };

/** A candidate after sanity checks: numbers in kg, mode settled, literal reading resolved. */
type Prepared = {
  spoken: number;
  unit: Unit;
  /** The unit weights are written in, in messages and options. */
  display: Unit;
  valueKg: number;
  barKg: number | null;
  mode: WeightMode;
  literal: ResolvedWeight;
  warnings: Issue[];
  source: 'tap' | 'voice';
};

type InBand = (totalKg: number) => boolean;

const { ranges, jumpFraction, plateStep, confusablePairs } = VALIDATION_CONFIG;
const EPSILON = 1e-9;
/** A weight in kg as the user is shown it: "60 kg" or "132.3 lb". */
const w = (kg: number, p: { display: Unit }) => withUnit(kg, p.display);

/** The number speech recognition may have confused with this one, or null (13 <-> 30 ... 19 <-> 90). */
function confusableOf(value: number): number | null {
  for (const [teen, tens] of confusablePairs) {
    if (value === teen) return tens;
    if (value === tens) return teen;
  }
  return null;
}

/** Reads a number as a total or as per-side weight; null when the result would be out of range. */
function readAs(
  kind: 'total' | 'per_side',
  valueKg: number,
  barKg: number | null,
): ResolvedWeight | null {
  if (kind === 'per_side') {
    if (barKg === null || valueKg > ranges.perSideKg.max) return null;
    const totalKg = roundKg(barKg + 2 * valueKg);
    if (totalKg > ranges.totalKg.max) return null;
    return { totalKg, barKg, perSideKg: roundKg(valueKg), inputMode: 'per_side' };
  }
  if (valueKg > ranges.totalKg.max) return null;
  // Keep the breakdown only when it is exact at 2 decimals: the database requires
  // total = bar + 2 x per side whenever both are stored.
  let perSideKg = barKg === null ? null : perSideFromTotal(valueKg, barKg);
  if (perSideKg !== null && barKg !== null && roundKg(barKg + 2 * perSideKg) !== valueKg)
    perSideKg = null;
  return { totalKg: valueKg, barKg, perSideKg, inputMode: 'total' };
}

function sanityIssues(
  { weight, reps }: SetCandidate,
  barKg: number | null,
  display: Unit,
): Issue[] {
  const issues: Issue[] = [];
  if (!Number.isFinite(reps) || !Number.isInteger(reps)) {
    issues.push({ code: 'INVALID_NUMBER', message: 'Reps must be a whole number.' });
  } else if (reps < ranges.reps.min || reps > ranges.reps.max) {
    issues.push({
      code: 'REPS_OUT_OF_RANGE',
      message: `Reps must be between ${ranges.reps.min} and ${ranges.reps.max}.`,
    });
  }
  if (!(Number.isFinite(weight.value) && weight.value >= 0)) {
    issues.push({ code: 'INVALID_NUMBER', message: 'Weight must be a number, zero or more.' });
  }
  if (barKg !== null && !(barKg >= ranges.barKg.min && barKg <= ranges.barKg.max)) {
    issues.push({
      code: 'INVALID_NUMBER',
      message: `Bar weight must be between ${formatWeight(ranges.barKg.min, display)} and ${maxDisplay(ranges.barKg.max, display)} ${display}.`,
    });
  }
  return issues;
}

function outOfRangeIssue(kind: 'total' | 'per_side', valueKg: number, display: Unit): Issue {
  return kind === 'per_side' && valueKg > ranges.perSideKg.max
    ? {
        code: 'PER_SIDE_OUT_OF_RANGE',
        message: `Weight per side must be at most ${maxDisplay(ranges.perSideKg.max, display)} ${display}.`,
      }
    : {
        code: 'WEIGHT_OUT_OF_RANGE',
        message: `Total weight must be at most ${maxDisplay(ranges.totalKg.max, display)} ${display}.`,
      };
}

/** Settles mode and the literal reading. Returns a rejection instead when it cannot. */
function prepare(candidate: SetCandidate, displayUnit?: Unit): Prepared | ValidationResult {
  const { equipment, weight } = candidate;
  const display = displayUnit ?? weight.unit;
  const hasBar = usesBar(equipment);
  const rawBar = hasBar ? candidate.barKg : null;

  const rejects = sanityIssues(candidate, rawBar, display);
  if (rejects.length > 0) return { status: 'reject', issues: rejects };

  const barKg = rawBar === null ? null : roundKg(rawBar);
  const valueKg = toKg(weight.value, weight.unit);
  const warnings: Issue[] = [];
  let mode = weight.mode;

  if (mode === 'per_side' && barKg === null) {
    if (hasBar) {
      return {
        status: 'reject',
        issues: [
          {
            code: 'MISSING_BAR',
            message: 'Set the bar weight for this gym to log a per-side weight.',
          },
        ],
      };
    }
    // Dumbbells, machines and cables have no bar: the number is the per-implement weight.
    mode = 'total';
    warnings.push({
      code: 'PER_SIDE_IGNORED',
      message:
        'This equipment has no bar, so the number is used as the weight per dumbbell or stack.',
    });
  }

  const kind = mode === 'per_side' ? 'per_side' : 'total';
  const literal = readAs(kind, valueKg, barKg);
  if (literal === null)
    return { status: 'reject', issues: [outOfRangeIssue(kind, valueKg, display)] };

  return {
    spoken: weight.value,
    unit: weight.unit,
    display,
    valueKg,
    barKg,
    mode,
    literal,
    warnings,
    source: candidate.source ?? 'voice',
  };
}

function perSideOption(
  p: Prepared,
  inBand: InBand | null,
): { option: Option; issue: Issue } | null {
  if (p.barKg === null) return null;
  const reading = readAs('per_side', p.valueKg, p.barKg);
  if (!reading || (inBand !== null && !inBand(reading.totalKg))) return null;
  const label = `${w(p.valueKg, p)} per side (${w(reading.totalKg, p)} total)`;
  return {
    option: { kind: 'per_side', label, resolved: reading },
    issue: {
      code: 'PER_SIDE_PLAUSIBLE',
      message: `As ${w(p.valueKg, p)} per side it is ${w(reading.totalKg, p)} in total, close to last time.`,
    },
  };
}

/** "Did you mean 60?" for a misheard 16: only when the alternative fits history and the spoken one does not. */
function confusableOption(p: Prepared, inBand: InBand): { option: Option; issue: Issue } | null {
  if (p.source === 'tap') return null; // a tapped number was chosen on purpose
  const alternative = Number.isInteger(p.spoken) ? confusableOf(p.spoken) : null;
  if (alternative === null) return null;
  const altKg = toKg(alternative, p.unit);
  const reading = readAs(p.mode === 'per_side' ? 'per_side' : 'total', altKg, p.barKg);
  const belowBar = p.barKg !== null && p.mode !== 'per_side' && altKg < p.barKg;
  if (!reading || belowBar || !inBand(reading.totalKg)) return null;
  return {
    option: {
      kind: 'confusable',
      label: `Did you mean ${alternative}? (${w(reading.totalKg, p)} total)`,
      resolved: reading,
    },
    issue: {
      code: 'CONFUSABLE_NUMBER',
      message: `${p.spoken} sounds like ${alternative}, which is close to last time.`,
    },
  };
}

const asSaidOption = (p: Prepared): Option => ({
  kind: 'as_said',
  label: `${w(p.literal.totalKg, p)} total, as said`,
  resolved: p.literal,
});

/** A total below the bar is impossible: ask "total or per side?". */
function askBelowBar(p: Prepared, inBand: InBand | null): ValidationResult | null {
  if (p.barKg === null || p.mode === 'per_side' || p.valueKg >= p.barKg) return null;

  const options: Option[] = [];
  const confusable = inBand ? confusableOption(p, inBand) : null;
  if (confusable) options.push(confusable.option);
  const perSide = perSideOption(p, null);
  if (perSide) options.push(perSide.option);
  options.push({
    kind: 'total_no_bar',
    label: `${w(p.valueKg, p)} total, without the ${w(p.barKg, p)} bar`,
    resolved: { totalKg: p.valueKg, barKg: null, perSideKg: null, inputMode: 'total' },
  });

  const issues: Issue[] = [
    {
      code: 'TOTAL_BELOW_BAR',
      message: `${w(p.valueKg, p)} is less than the ${w(p.barKg, p)} bar. Is that the total or per side?`,
    },
  ];
  if (confusable) issues.push(confusable.issue);
  return { status: 'ask', options, issues: [...issues, ...p.warnings] };
}

/** A big change from the last session: offer plausible readings, plus what was said. */
function askLargeJump(p: Prepared, last: number, inBand: InBand): ValidationResult | null {
  if (inBand(p.literal.totalKg)) return null;

  const options: Option[] = [];
  const issues: Issue[] = [
    {
      code: 'LARGE_JUMP',
      message: `${w(p.literal.totalKg, p)} is a big change from last time (${w(last, p)}).`,
    },
  ];
  const perSide = p.mode === 'unspecified' ? perSideOption(p, inBand) : null;
  if (perSide) {
    options.push(perSide.option);
    issues.push(perSide.issue);
  }
  const confusable = confusableOption(p, inBand);
  if (confusable) {
    options.push(confusable.option);
    issues.push(confusable.issue);
  }
  // Nothing to choose between: a tapped number is only flagged, while a spoken one is still confirmed.
  if (options.length === 0 && p.source === 'tap')
    return {
      status: 'warn',
      resolved: p.literal,
      issues: [...issues, ...p.warnings, ...[plateWarning(p)].filter((issue) => issue !== null)],
    };
  options.push(asSaidOption(p));
  return { status: 'ask', options, issues: [...issues, ...p.warnings] };
}

/** Standard plates cannot make this weight: a soft warning, never a block. */
function plateWarning(p: Prepared): Issue | null {
  // Measured on the exact per-side weight, not the stored breakdown, which is dropped when inexact.
  const perSideKg =
    p.barKg === null ? null : p.mode === 'per_side' ? p.valueKg : (p.valueKg - p.barKg) / 2;
  if (perSideKg === null) return null;
  // Checked as shown, in the unit's own plate size: 20.41 kg is 45 lb, a plate size, not 44.9965.
  const shown = toDisplay(perSideKg, p.display);
  const step = plateStep[p.display];
  if (isMultipleOf(shown, step)) return null;
  return {
    code: 'PLATE_INCREMENT',
    message: `${shown} ${p.display} per side is not a multiple of ${step} ${p.display}. Check the plates.`,
  };
}

/** Everything is plausible. Soft-warn about weights that standard plates cannot make. */
function finish(p: Prepared): ValidationResult {
  const plates = plateWarning(p);
  const warnings = plates ? [...p.warnings, plates] : [...p.warnings];
  return warnings.length > 0
    ? { status: 'warn', resolved: p.literal, issues: warnings }
    : { status: 'ok', resolved: p.literal, issues: [] };
}

export function validateSet(
  candidate: SetCandidate,
  context: ValidationContext = {},
): ValidationResult {
  const prepared = prepare(candidate, context.displayUnit);
  if ('status' in prepared) return prepared;

  const last = context.lastTotalKg;
  const hasHistory = last !== undefined && Number.isFinite(last) && last > 0;
  const inBand: InBand | null = hasHistory
    ? (totalKg) => Math.abs(totalKg - last) <= last * jumpFraction + EPSILON
    : null;

  return (
    askBelowBar(prepared, inBand) ??
    (hasHistory && inBand ? askLargeJump(prepared, last, inBand) : null) ??
    finish(prepared)
  );
}

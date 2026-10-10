// Showing and typing weights in the user's unit. Storage is always kg (ADR-002). This module
// converts for display and entry (`weight/index.ts` `toKg` is the same arithmetic, and a test keeps
// the two equal). Pure: no React, network or storage.
import type { Unit } from '../schemas';
import { LB_TO_KG, roundKg } from '../weight';

export const unitLabel = (unit: Unit): string => unit;

const round = (value: number, decimals: number): number => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

/**
 * A stored kg weight as the user sees it: kg to 2 decimals, lb to 1. Stored kg has 2 decimals, so
 * 0.01 kg is about 0.02 lb, and a weight typed in lb to 1 decimal always shows as typed.
 */
export function toDisplay(kg: number, unit: Unit): number {
  return unit === 'kg' ? roundKg(kg) : round(kg / LB_TO_KG, 1);
}

/**
 * The largest weight to show for a limit in kg: rounded down, so it never shows a number that is
 * over the limit once converted back (250 kg is 551.15 lb, and 551.2 lb is 250.02 kg).
 */
export function maxDisplay(kg: number, unit: Unit): number {
  return unit === 'kg' ? roundKg(kg) : Math.floor((kg / LB_TO_KG) * 10 + 1e-9) / 10;
}

/** A weight typed in the user's unit, as kg to 2 decimals for storage. */
export function fromDisplay(value: number, unit: Unit): number {
  return unit === 'kg' ? roundKg(value) : roundKg(value * LB_TO_KG);
}

/** 60 -> "60", 132.28 lb -> "132.3": the number as shown, no trailing zeros, no unit. */
export function formatWeight(kg: number, unit: Unit): string {
  return String(toDisplay(kg, unit));
}

/** A weight with its unit: "60 kg", "132.3 lb". */
export function withUnit(kg: number, unit: Unit): string {
  return `${formatWeight(kg, unit)} ${unitLabel(unit)}`;
}

/** The smallest plate pair, per side. Anything that is not a multiple of it gets a soft warning. */
export const PLATE_STEP: Record<Unit, number> = { kg: 1.25, lb: 2.5 };

/** How far one tap on + or - moves a weight, in the user's unit. */
export const ENTRY_STEP = {
  total: { kg: 2.5, lb: 5 },
  per_side: { kg: 1.25, lb: 2.5 },
} as const;

const PLAIN_NUMBER = /^(\d+\.?\d*|\.\d+)$/;
// A comma is a decimal point only in the form "7,5" or "20,25". "1,000" is a thousands separator
// and would otherwise be read as 1, so it is refused.
const COMMA_DECIMAL = /^\d*,\d{1,2}$/;

/** A typed number, or null if it is not a plain one. "62,5" is 62.5; "1,000", "1e3" and "0x10" are refused. */
export function parseNumber(text: string): number | null {
  const typed = text.trim();
  const normal = COMMA_DECIMAL.test(typed) ? typed.replace(',', '.') : typed;
  if (!PLAIN_NUMBER.test(normal)) return null;
  const value = Number(normal);
  return Number.isFinite(value) ? round(value, 2) : null;
}

/**
 * A weight field that starts from a stored kg value, such as the last set or a gym's bar. In lb the
 * text is rounded (60 kg shows as 132.3), and converting the text back gives 60.01 kg, so the field
 * remembers the stored value it was made from.
 */
export type WeightField = { text: string; origin: number | null };

export const fieldFromKg = (kg: number, unit: Unit): WeightField => ({
  text: formatWeight(kg, unit),
  origin: kg,
});

export const fieldFromText = (text: string): WeightField => ({ text, origin: null });

/** The kg value a field means: the stored value it started from if the text is unchanged, else the typed text converted. */
export function kgFromField(field: WeightField, unit: Unit): number | null {
  if (field.origin !== null && field.text.trim() === formatWeight(field.origin, unit))
    return field.origin;
  const typed = parseNumber(field.text);
  return typed === null ? null : fromDisplay(typed, unit);
}

// Every plausibility threshold lives here so it can be tuned and tested (docs/domain/weight-rules.md).
import { PLATE_STEP } from '../units';
import { BAR_KG_RANGE, PER_SIDE_KG_RANGE, REPS_RANGE, TOTAL_KG_RANGE } from '../schemas';

export const VALIDATION_CONFIG = {
  ranges: {
    reps: REPS_RANGE,
    totalKg: TOTAL_KG_RANGE,
    perSideKg: PER_SIDE_KG_RANGE,
    barKg: BAR_KG_RANGE,
  },
  /** A total further than this fraction from the last session's total triggers a question. */
  jumpFraction: 0.4,
  /** Standard plates come in multiples of this per side in each unit; anything else only gets a soft warning. */
  plateStep: PLATE_STEP,
  /** Numbers speech recognition mixes up: a "teen" and its "ty" (13/30 ... 19/90). */
  confusablePairs: [
    [13, 30],
    [14, 40],
    [15, 50],
    [16, 60],
    [17, 70],
    [18, 80],
    [19, 90],
  ],
} as const;

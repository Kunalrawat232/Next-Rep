/** The muscle groups an exercise can be filed under. Mirrored by the check in migration 0003. */
export const MUSCLES = [
  'chest',
  'shoulders',
  'biceps',
  'triceps',
  'forearms',
  'lats',
  'upper_back',
  'traps',
  'lower_back',
  'abs',
  'glutes',
  'quads',
  'hamstrings',
  'calves',
  'adductors',
  'abductors',
] as const;

export type Muscle = (typeof MUSCLES)[number];

export const MUSCLE_LABEL: Record<Muscle, string> = {
  chest: 'Chest',
  shoulders: 'Shoulders',
  biceps: 'Biceps',
  triceps: 'Triceps',
  forearms: 'Forearms',
  lats: 'Lats',
  upper_back: 'Upper back',
  traps: 'Traps',
  lower_back: 'Lower back',
  abs: 'Abs',
  glutes: 'Glutes',
  quads: 'Quads',
  hamstrings: 'Hamstrings',
  calves: 'Calves',
  adductors: 'Adductors',
  abductors: 'Abductors',
};

/** Words people use for a muscle, besides its label. Used by search. */
export const MUSCLE_SYNONYMS: Record<Muscle, string[]> = {
  chest: ['pec', 'pecs', 'pectoral', 'pectorals'],
  shoulders: ['shoulder', 'delt', 'delts', 'deltoid', 'deltoids'],
  biceps: ['bicep', 'arms', 'arm'],
  triceps: ['tricep', 'arms', 'arm'],
  forearms: ['forearm', 'grip', 'arms', 'arm'],
  lats: ['lat', 'back', 'latissimus'],
  upper_back: ['back', 'rhomboid', 'rhomboids'],
  traps: ['trap', 'trapezius'],
  lower_back: ['back', 'spine', 'erector', 'erectors'],
  abs: ['ab', 'core', 'abdominals', 'stomach'],
  glutes: ['glute', 'butt', 'booty'],
  quads: ['quad', 'quadriceps', 'legs', 'leg', 'thigh', 'thighs'],
  hamstrings: ['hamstring', 'hammy', 'legs', 'leg', 'thigh', 'thighs'],
  calves: ['calf', 'legs', 'leg'],
  adductors: ['adductor', 'inner thigh', 'legs', 'leg'],
  abductors: ['abductor', 'outer thigh', 'legs', 'leg'],
};

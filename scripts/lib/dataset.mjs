// Shared by the dataset scripts: how an exercise of the open dataset becomes one of ours.
import { createHash } from 'node:crypto';

// Fixed namespace, so an exercise keeps the same id every time the import is re-run.
const NAMESPACE = 'a3f1c2d4-5b6e-4f70-8a91-b2c3d4e5f607';

export function uuidV5(name) {
  const hash = createHash('sha1')
    .update(Buffer.from(NAMESPACE.replaceAll('-', ''), 'hex'))
    .update(name)
    .digest();
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const h = hash.subarray(0, 16).toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** The dataset's muscle names that match one of ours. */
export const MUSCLE = {
  pectorals: 'chest',
  delts: 'shoulders',
  biceps: 'biceps',
  triceps: 'triceps',
  forearms: 'forearms',
  lats: 'lats',
  'upper back': 'upper_back',
  traps: 'traps',
  spine: 'lower_back',
  abs: 'abs',
  glutes: 'glutes',
  quads: 'quads',
  hamstrings: 'hamstrings',
  calves: 'calves',
  adductors: 'adductors',
  abductors: 'abductors',
};

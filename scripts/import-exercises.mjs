// Builds src/domain/exercises.extended.json from the open exercises dataset
// (https://github.com/hasaneyldrm/exercises-dataset, MIT for the data; its images and GIFs are NOT
// used, see THIRD_PARTY_NOTICES.md and ADR-010).
// Usage: node scripts/import-exercises.mjs path/to/exercises.json
// The output is committed and reviewed; the 17 MB source file is not.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { MUSCLES } from '../src/domain/exercises/muscles.ts';

const input = process.argv[2];
if (!input) {
  console.error('Usage: node scripts/import-exercises.mjs path/to/exercises.json');
  process.exit(1);
}

// Fixed namespace, so an exercise keeps the same id every time the import is re-run.
const NAMESPACE = 'a3f1c2d4-5b6e-4f70-8a91-b2c3d4e5f607';

function uuidV5(name) {
  const hash = createHash('sha1')
    .update(Buffer.from(NAMESPACE.replaceAll('-', ''), 'hex'))
    .update(name)
    .digest();
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const h = hash.subarray(0, 16).toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// Only equipment that maps cleanly to how we count weight (bar included, or per dumbbell).
const EQUIPMENT = {
  barbell: 'barbell',
  'olympic barbell': 'barbell',
  'ez barbell': 'ez_bar',
  'smith machine': 'smith',
  dumbbell: 'dumbbell',
  cable: 'cable',
  'leverage machine': 'machine',
  'body weight': 'bodyweight',
};

const BODY_PART = {
  'upper arms': 'upper',
  'lower arms': 'upper',
  shoulders: 'upper',
  chest: 'upper',
  back: 'upper',
  'upper legs': 'lower',
  'lower legs': 'lower',
  waist: 'core',
};

const MUSCLE = {
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

const NOISE =
  /stretch|circle|swing|\broll(ing)?\b|warm|jog|jump|walk|run\b|bike|crawl|\(male\)|\(female\)|mobility|pose|yoga|\bball\b|\bpov\b|blaster|\bv\. ?\d|\bbosu\b|\brope jump|assisted|plank|sprint|isometric|skier|skin the cat|mountain climber|kipping/i;

const titleCase = (name) =>
  name
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/(^|[\s(/-])([a-z])/g, (_, lead, letter) => lead + letter.toUpperCase());

const tokenKey = (name) =>
  name
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .sort()
    .join(' ');

const source = JSON.parse(readFileSync(input, 'utf8'));
const curated = JSON.parse(
  readFileSync(new URL('../src/domain/exercises.seed.json', import.meta.url), 'utf8'),
);
const curatedKeys = new Set(curated.map((e) => tokenKey(e.name)));
const curatedNames = new Set(
  curated.flatMap((e) => [e.name, ...e.aliases]).map((s) => s.toLowerCase()),
);

const dropped = {
  equipment: 0,
  bodyPart: 0,
  noise: 0,
  muscle: 0,
  long: 0,
  curatedDuplicate: 0,
  duplicate: 0,
};
const seen = new Set();
const droppedNames = []; // printed with --list, so a reviewer can see what the noise filter removed
const out = [];

for (const row of source) {
  const known = EQUIPMENT[row.equipment];
  // "lever ..." names are machine exercises; a few are labelled barbell in the source. Only rows
  // whose equipment we accept at all get this correction.
  const equipmentType = known && /^lever\b/i.test(row.name) ? 'machine' : known;
  if (!equipmentType) {
    dropped.equipment++;
    continue;
  }
  const bodyPart = BODY_PART[row.body_part];
  if (!bodyPart) {
    dropped.bodyPart++;
    continue;
  }
  if (NOISE.test(row.name)) {
    dropped.noise++;
    droppedNames.push(row.name);
    continue;
  }
  const muscle = MUSCLE[row.target];
  if (!muscle) {
    dropped.muscle++;
    continue;
  }
  const name = titleCase(row.name);
  if (name.length > 60) {
    dropped.long++;
    continue;
  }
  if (curatedKeys.has(tokenKey(name)) || curatedNames.has(name.toLowerCase())) {
    dropped.curatedDuplicate++;
    continue;
  }
  if (seen.has(name.toLowerCase())) {
    dropped.duplicate++;
    continue;
  }
  seen.add(name.toLowerCase());
  out.push({
    id: uuidV5(`exercises-dataset:${row.id}`),
    name,
    equipmentType,
    bodyPart,
    muscle,
    aliases: [],
  });
}

for (const e of out) {
  if (!MUSCLES.includes(e.muscle)) throw new Error(`Unknown muscle ${e.muscle}`);
}
out.sort((a, b) => a.name.localeCompare(b.name));
writeFileSync(
  new URL('../src/domain/exercises.extended.json', import.meta.url),
  JSON.stringify(out, null, 2) + '\n',
);
console.log(`Wrote ${out.length} exercises. Dropped:`, dropped);
if (process.argv.includes('--list')) console.log(droppedNames.sort().join('\n'));

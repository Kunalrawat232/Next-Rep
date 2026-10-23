// Builds src/domain/exercises.photos.json: which free-exercise-db photos (a start and an end pose) show for
// which of our exercises. Usage: node scripts/match-exercise-photos.mjs path/to/exercises.json [--write]
// The source is https://github.com/yuhonas/free-exercise-db (Unlicense), file dist/exercises.json. Without
// --write it only prints the report. The photos are never copied: the app loads them from the dataset at run
// time (see src/domain/exercises/demoMedia.ts).
//
// There is no shared id with our exercises, so everything matches by normalised name. A name several rows share,
// or a lone row whose note in brackets names a variant ours does not, is reported and left without photos until
// a person decides it in scripts/exercise-photo-overrides.json ({ "Our exercise name": "dataset id" or null }).
import { readFileSync, writeFileSync } from 'node:fs';
import { matchDemos } from '../src/domain/exercises/demoMatch.ts';

const input = process.argv[2];
if (!input) {
  console.error('Usage: node scripts/match-exercise-photos.mjs path/to/exercises.json [--write]');
  process.exit(1);
}
const read = (relative) => JSON.parse(readFileSync(new URL(relative, import.meta.url), 'utf8'));

const dataset = JSON.parse(readFileSync(input, 'utf8')).filter((row) => row.images?.length === 2);
const ours = [
  ...read('../src/domain/exercises.seed.json'),
  ...read('../src/domain/exercises.extended.json'),
];
const overridesByName = read('./exercise-photo-overrides.json');
const idByName = new Map(ours.map((e) => [e.name, e.id]));
const overrides = {};
for (const [name, datasetId] of Object.entries(overridesByName)) {
  const id = idByName.get(name);
  if (!id) throw new Error(`Override names an exercise we do not have: "${name}"`);
  overrides[id] = datasetId; // null means: decided, no photos
}

const report = matchDemos(ours, dataset, {
  ourIdFor: (row) => `no-shared-id:${row.id}`,
  overrides,
});

const words = (name) =>
  new Set(
    name
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean),
  );
function suggestions(name) {
  const mine = words(name);
  return dataset
    .map((row) => {
      const theirs = words(row.name);
      const shared = [...mine].filter((w) => theirs.has(w)).length;
      return { row, score: shared / (mine.size + theirs.size - shared) };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((s) => `${s.row.id} "${s.row.name}"`);
}

const curated = new Set(read('../src/domain/exercises.seed.json').map((e) => e.name));
const byHow = { id: 0, name: 0, override: 0 };
for (const m of report.matched) byHow[m.how]++;
console.log(`Our exercises: ${ours.length}. Dataset rows with two photos: ${dataset.length}.`);
console.log(
  `Matched ${report.matched.length} (by name ${byHow.name}, by override ${byHow.override}), ` +
    `ambiguous ${report.ambiguous.length}, declined ${report.declined.length}, unmatched ${report.unmatched.length}.`,
);
const hand = report.unmatched.filter((u) => curated.has(u.name));
console.log(
  `Hand-made exercises (the popular ones) without photos: ${hand.length} of ${curated.size}.`,
);
console.log('\nMatched by override (check these):');
for (const m of report.matched.filter((x) => x.how === 'override'))
  console.log(`  "${m.ours.name}" -> ${m.row.id} "${m.row.name}"`);
if (report.declined.length) {
  console.log('\nDeclined by a person (no photos):');
  for (const d of report.declined) console.log(`  "${d.name}"`);
}
if (report.ambiguous.length) {
  console.log('\nAmbiguous (no photos until decided in the overrides file):');
  for (const a of report.ambiguous)
    console.log(`  "${a.ours.name}": ${a.rows.map((r) => `${r.id} "${r.name}"`).join(' | ')}`);
}
if (process.argv.includes('--hand')) {
  console.log('\nHand-made exercises without photos (closest dataset names):');
  for (const u of hand) console.log(`  "${u.name}": ${suggestions(u.name).join(' | ') || 'none'}`);
}

if (process.argv.includes('--write')) {
  const map = {};
  for (const { ours: item, row } of report.matched) map[item.id] = row.id;
  const sorted = Object.fromEntries(Object.entries(map).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(
    new URL('../src/domain/exercises.photos.json', import.meta.url),
    JSON.stringify(sorted, null, 2) + '\n',
  );
  console.log(
    `\nWrote ${Object.keys(sorted).length} entries to src/domain/exercises.photos.json. Run \`npx prettier --write src/domain/exercises.photos.json\` so the diff only shows real changes.`,
  );
}

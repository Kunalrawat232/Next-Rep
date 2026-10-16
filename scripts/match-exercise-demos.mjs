// Builds src/domain/exercises.demo.json: which dataset animation shows for which of our exercises.
// Usage: node scripts/match-exercise-demos.mjs path/to/exercises.json [--write]
// Without --write it only prints the report. The 17 MB source file is never committed, and neither are the
// GIFs: the app loads them from the dataset at runtime (see src/domain/exercises/demoMedia.ts).
//
// Imported exercises match exactly, by the id the import script derived from the dataset id. The hand-made
// ones match by normalised name. A name several rows share is "ambiguous" and gets no demo until a person
// decides it in scripts/exercise-demo-overrides.json ({ "Our exercise name": "dataset id" }).
import { readFileSync, writeFileSync } from 'node:fs';
import { matchDemos } from '../src/domain/exercises/demoMatch.ts';
import { MUSCLE, uuidV5 } from './lib/dataset.mjs';

const input = process.argv[2];
if (!input) {
  console.error('Usage: node scripts/match-exercise-demos.mjs path/to/exercises.json [--write]');
  process.exit(1);
}
const read = (relative) => JSON.parse(readFileSync(new URL(relative, import.meta.url), 'utf8'));

const dataset = JSON.parse(readFileSync(input, 'utf8'));
const ours = [
  ...read('../src/domain/exercises.seed.json'),
  ...read('../src/domain/exercises.extended.json'),
];
const overridesByName = read('./exercise-demo-overrides.json');
const idByName = new Map(ours.map((e) => [e.name, e.id]));
const overrides = {};
for (const [name, datasetId] of Object.entries(overridesByName)) {
  const id = idByName.get(name);
  if (!id) throw new Error(`Override names an exercise we do not have: "${name}"`);
  overrides[id] = datasetId; // null means: decided, no demo
}

const report = matchDemos(ours, dataset, {
  ourIdFor: (row) => uuidV5(`exercises-dataset:${row.id}`),
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

const byHow = { id: 0, name: 0, override: 0 };
for (const m of report.matched) byHow[m.how]++;
console.log(`Our exercises: ${ours.length}. Dataset rows: ${dataset.length}.`);
console.log(
  `Matched ${report.matched.length} (by id ${byHow.id}, by name ${byHow.name}, by override ${byHow.override}), ` +
    `ambiguous ${report.ambiguous.length}, declined ${report.declined.length}, unmatched ${report.unmatched.length}.`,
);
if (byHow.name + byHow.override > 0) {
  console.log('\nMatched by name or override (check these):');
  for (const m of report.matched.filter((x) => x.how !== 'id'))
    console.log(`  [${m.how}] "${m.ours.name}" -> ${m.row.id} "${m.row.name}"`);
}
if (report.declined.length) {
  console.log('\nDeclined by a person (no demo):');
  for (const d of report.declined) console.log(`  "${d.name}"`);
}
if (report.ambiguous.length) {
  console.log('\nAmbiguous (no demo until decided in the overrides file):');
  for (const a of report.ambiguous)
    console.log(`  "${a.ours.name}": ${a.rows.map((r) => `${r.id} "${r.name}"`).join(' | ')}`);
}
if (report.unmatched.length) {
  console.log('\nUnmatched (closest dataset names):');
  for (const u of report.unmatched)
    console.log(`  "${u.name}": ${suggestions(u.name).join(' | ') || 'none'}`);
}

if (process.argv.includes('--write')) {
  const primary = new Map(ours.map((e) => [e.id, e.muscle]));
  const map = {};
  for (const { ours: item, row } of report.matched) {
    const secondary = [
      ...new Set((row.secondary_muscles ?? []).map((m) => MUSCLE[m]).filter(Boolean)),
    ]
      .filter((m) => m !== primary.get(item.id))
      .sort();
    map[item.id] = { gif: row.gif_url, thumb: row.image, secondary };
  }
  const sorted = Object.fromEntries(Object.entries(map).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(
    new URL('../src/domain/exercises.demo.json', import.meta.url),
    JSON.stringify(sorted, null, 2) + '\n',
  );
  console.log(`\nWrote ${Object.keys(sorted).length} entries to src/domain/exercises.demo.json.`);
}

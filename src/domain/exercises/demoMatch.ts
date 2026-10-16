// Pairs our exercises with the rows of the open exercises dataset, for the demo animations. Pure, and with no
// imports, so scripts/match-exercise-demos.mjs can run it directly. Nothing here guesses: a name that fits
// several rows is reported as ambiguous and left without a demo until a person decides.

/** A name as exercises are compared: case, accents, punctuation and a "(Barbell)" style note do not count. */
export function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export type Ours = { id: string; name: string };
export type DatasetRow = { id: string; name: string };

export type MatchHow = 'override' | 'id' | 'name';
export type MatchReport<Row extends DatasetRow> = {
  matched: { ours: Ours; row: Row; how: MatchHow }[];
  /** Several dataset rows share this name: nothing is chosen. */
  ambiguous: { ours: Ours; rows: Row[] }[];
  /** A person decided this one gets no demo. */
  declined: Ours[];
  unmatched: Ours[];
};

type Options<Row extends DatasetRow> = {
  /** The id our import gave this dataset row, so imported exercises match exactly, not by name. */
  ourIdFor: (row: Row) => string;
  /** A person's decisions: our exercise id to a dataset row id, or null for "no demo". They win over everything else. */
  overrides?: Readonly<Record<string, string | null>>;
};

export function matchDemos<Row extends DatasetRow>(
  ours: readonly Ours[],
  dataset: readonly Row[],
  { ourIdFor, overrides = {} }: Options<Row>,
): MatchReport<Row> {
  const byOurId = new Map(dataset.map((row) => [ourIdFor(row), row]));
  const byDatasetId = new Map(dataset.map((row) => [row.id, row]));
  const byName = new Map<string, Row[]>();
  for (const row of dataset) {
    const key = normalizeName(row.name);
    if (key === '') continue; // a name of only a note says nothing
    byName.set(key, [...(byName.get(key) ?? []), row]);
  }

  const report: MatchReport<Row> = { matched: [], ambiguous: [], declined: [], unmatched: [] };
  for (const item of ours) {
    const chosen = overrides[item.id];
    if (chosen === null) {
      report.declined.push(item);
      continue;
    }
    if (chosen !== undefined) {
      const row = byDatasetId.get(chosen);
      if (!row)
        throw new Error(
          `Override for "${item.name}" names a dataset row that does not exist: ${chosen}`,
        );
      report.matched.push({ ours: item, row, how: 'override' });
      continue;
    }
    const exact = byOurId.get(item.id);
    if (exact) {
      report.matched.push({ ours: item, row: exact, how: 'id' });
      continue;
    }
    const key = normalizeName(item.name);
    const candidates = key === '' ? [] : (byName.get(key) ?? []);
    // Several rows share the normalised name: the one whose own name is exactly ours is not a guess.
    const same = candidates.filter(
      (row) => row.name.trim().toLowerCase() === item.name.trim().toLowerCase(),
    );
    const only = candidates.length === 1 ? candidates[0] : same.length === 1 ? same[0] : undefined;
    if (only) report.matched.push({ ours: item, row: only, how: 'name' });
    else if (candidates.length > 1) report.ambiguous.push({ ours: item, rows: candidates });
    else report.unmatched.push(item);
  }
  return report;
}

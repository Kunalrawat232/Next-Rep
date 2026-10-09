// Characters that show nothing: a name made only of them would look empty.
const INVISIBLE = /[\u200B-\u200D\u2060\uFEFF\u00AD]/g;

/** Trimmed, inner spaces collapsed, one Unicode form, and no invisible characters. */
export const cleanName = (name: string): string =>
  name.replace(INVISIBLE, '').trim().replace(/\s+/g, ' ').normalize('NFC');

/** What two names are compared by: case, accents and look-alike forms do not make a different name. */
export const nameKey = (name: string): string =>
  cleanName(name)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

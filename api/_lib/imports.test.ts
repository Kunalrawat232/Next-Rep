import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Vercel runs the function as native ES modules, which need a file extension on every relative import.
// The editor and Vite do not, so a missing one only shows up as a crash on the deployed function.
const root = resolve(__dirname, '../..');
const RELATIVE = /(?:from|import)\s*\(?\s*['"](\.{1,2}\/[^'"]*)['"]/g;

function sourceOf(path: string): string {
  const ts = path.replace(/\.js$/, '.ts');
  return existsSync(ts) ? ts : path;
}

describe('the /api functions imports', () => {
  it('give every relative import in the files it reaches an extension that exists', () => {
    const seen = new Set<string>();
    const problems: string[] = [];
    const visit = (file: string) => {
      if (seen.has(file)) return;
      seen.add(file);
      for (const [, specifier] of readFileSync(file, 'utf8').matchAll(RELATIVE)) {
        if (!specifier || !/\.(js|json)$/.test(specifier)) {
          problems.push(`${file.replace(root, '')}: ${specifier}`);
          continue;
        }
        const target = resolve(dirname(file), specifier);
        if (!existsSync(sourceOf(target)))
          problems.push(`${file.replace(root, '')}: missing ${specifier}`);
        else visit(sourceOf(target));
      }
    };
    visit(resolve(root, 'api/parse.ts'));
    visit(resolve(root, 'api/coach.ts'));
    expect(problems).toEqual([]);
    expect(seen.size).toBeGreaterThan(5);
  });
});

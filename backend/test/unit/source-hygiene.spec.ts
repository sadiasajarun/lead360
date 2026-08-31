/**
 * A regex once had its \b word boundaries silently replaced by literal backspace bytes (0x08) while being
 * edited. It compiled, it looked correct in every listing and diff, and it could never match. That shipped.
 *
 * Control characters have no legitimate place in this source tree, so this test refuses them outright.
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

const SRC = join(__dirname, '..', '..', 'src');

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (entry.endsWith('.ts')) out.push(full);
  }
  return out;
}

describe('source hygiene', () => {
  const files = sourceFiles(SRC);

  it('finds source files to check', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it('contains no control characters — the escape corruption that shipped an inert regex', () => {
    // Tab, newline and carriage return are legitimate; everything else in this range is corruption.
    const offenders: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      text.split('\n').forEach((line, i) => {
        // eslint-disable-next-line no-control-regex
        const bad = line.match(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g);
        if (bad) {
          const codes = [...new Set(bad.map((c) => '0x' + c.charCodeAt(0).toString(16).padStart(2, '0')))];
          offenders.push(`${file.replace(SRC, 'src')}:${i + 1} contains ${codes.join(', ')}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });
});

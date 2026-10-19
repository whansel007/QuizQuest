/* csv.spec.js
 Unit tests for the CSV export helpers in web/src/teacher/csv.js, used by
 the professor dashboard's "Export CSV" buttons.
*/
import { describe, it, expect } from 'vitest';
import { toCsv, pctCell, secCell } from '../csv.js';

describe('TestSuite: toCsv', () => {
  it('Test1: joins cells with commas and rows with new lines', () => {
    expect(toCsv([['Topic', 'Accuracy'], ['Security', 80]])).toBe('Topic,Accuracy\nSecurity,80\n');
  });

  it('Test2: wraps cells containing commas or quotes in double quotes', () => {
    expect(toCsv([['Hello, world']])).toBe('"Hello, world"\n');
    expect(toCsv([['Say "hi"']])).toBe('"Say ""hi"""\n');
  });

  it('Test3: neutralises cells that a spreadsheet would run as a formula', () => {
    expect(toCsv([['=SUM(A1:A9)']])).toBe("'=SUM(A1:A9)\n");
    expect(toCsv([['+65 9123 4567']])).toBe("'+65 9123 4567\n");
  });

  it('Test4: empty values become empty cells', () => {
    expect(toCsv([[null, undefined, '']])).toBe(',,\n');
  });
});

describe('TestSuite: pctCell and secCell', () => {
  it('Test1: a rate becomes a percentage with one decimal', () => {
    expect(pctCell(0.8)).toBe(80);
    expect(pctCell(0.1234)).toBe(12.3);
  });

  it('Test2: milliseconds become seconds with one decimal', () => {
    expect(secCell(12340)).toBe(12.3);
  });

  it('Test3: missing data stays blank instead of 0', () => {
    expect(pctCell(null)).toBe('');
    expect(secCell(undefined)).toBe('');
    expect(pctCell(0)).not.toBe('');
  });
});

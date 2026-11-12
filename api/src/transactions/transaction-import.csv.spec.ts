import { BadRequestException } from '@nestjs/common';
import { parseCsvRecords } from './transaction-import.csv';

describe('parseCsvRecords', () => {
  it('omits rows whose cells are all whitespace', () => {
    expect(parseCsvRecords('a,b\n\n \t ,  \nc,d\n')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });

  it('treats a lone carriage return as a row delimiter', () => {
    expect(parseCsvRecords('a,b\rc,d')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });

  it('unescapes doubled quotes inside a quoted field', () => {
    expect(parseCsvRecords('"He said ""hi""",x')).toEqual([
      ['He said "hi"', 'x'],
    ]);
  });

  it('rejects an unclosed quote', () => {
    expect(() => parseCsvRecords('"oops,still-open')).toThrow(
      BadRequestException,
    );
    expect(() => parseCsvRecords('"oops,still-open')).toThrow(
      'CSV contains an unclosed quote',
    );
  });
});

import { BadRequestException } from '@nestjs/common';

export const parseCsvRecords = (csv: string): string[][] => {
  const records: string[][] = [];
  let record: string[] = [];
  let field = '';
  let quoted = false;
  let closedQuote = false;

  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index];

    if (quoted) {
      if (character === '"') {
        if (csv[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
          closedQuote = true;
        }
      } else {
        field += character;
      }
      continue;
    }

    if (closedQuote) {
      if (character === ',') {
        record.push(field);
        field = '';
        closedQuote = false;
      } else if (character === '\n' || character === '\r') {
        if (character === '\r' && csv[index + 1] === '\n') index += 1;
        record.push(field);
        records.push(record);
        record = [];
        field = '';
        closedQuote = false;
      } else if (!/\s/.test(character)) {
        throw new BadRequestException('Malformed CSV quoting');
      }
    } else if (character === '"') {
      if (field.length > 0) {
        throw new BadRequestException('Malformed CSV quoting');
      }
      quoted = true;
    } else if (character === ',') {
      record.push(field);
      field = '';
    } else if (character === '\n' || character === '\r') {
      if (character === '\r' && csv[index + 1] === '\n') index += 1;
      record.push(field);
      records.push(record);
      record = [];
      field = '';
    } else {
      field += character;
    }
  }

  if (quoted) throw new BadRequestException('CSV contains an unclosed quote');
  if (field.length > 0 || record.length > 0) {
    record.push(field);
    records.push(record);
  }

  return records.filter((row) => row.some((value) => value.trim().length > 0));
};

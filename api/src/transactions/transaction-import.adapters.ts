import { BadRequestException } from '@nestjs/common';
import { parseCsvRecords } from './transaction-import.csv';

const CANONICAL_HEADERS = ['date', 'description', 'amount', 'type'] as const;

const DATE_ALIASES = [
  'date',
  'transaction date',
  'value date',
  'posting date',
] as const;
const DESCRIPTION_ALIASES = [
  'description',
  'narration',
  'particulars',
  'details',
] as const;

export type TransactionImportAdapterId =
  'stead-canonical' | 'provisional-debit-credit';

export type TransactionImportAdapter = {
  id: TransactionImportAdapterId;
  matches: (headers: string[]) => boolean;
  toCanonicalCsv: (records: string[][]) => string;
};

const normalizeHeader = (header: string, index: number) =>
  (index === 0 ? header.replace(/^\uFEFF/, '') : header).trim().toLowerCase();

const csvEscape = (value: string) => {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
};

const findHeaderIndex = (headers: string[], aliases: readonly string[]) => {
  for (const alias of aliases) {
    const index = headers.indexOf(alias);
    if (index !== -1) return index;
  }
  return -1;
};

const toIsoDate = (value: string) => {
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  const slash = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) {
    const day = slash[1].padStart(2, '0');
    const month = slash[2].padStart(2, '0');
    return `${slash[3]}-${month}-${day}`;
  }

  const dash = trimmed.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dash) {
    const day = dash[1].padStart(2, '0');
    const month = dash[2].padStart(2, '0');
    return `${dash[3]}-${month}-${day}`;
  }

  return trimmed;
};

const amountPresent = (value: string | undefined) =>
  Boolean(value?.trim().replace(/^(?:NGN|₦)\s*/i, ''));

const steadCanonicalAdapter: TransactionImportAdapter = {
  id: 'stead-canonical',
  matches: (headers) =>
    CANONICAL_HEADERS.every((header) => headers.includes(header)),
  toCanonicalCsv: (records) =>
    records.map((record) => record.map(csvEscape).join(',')).join('\n'),
};

/**
 * Provisional layout for common statement exports that use separate debit and
 * credit amount columns instead of amount+type. Not tied to a branded bank —
 * validate against consented customer samples before claiming institution support.
 */
const provisionalDebitCreditAdapter: TransactionImportAdapter = {
  id: 'provisional-debit-credit',
  matches: (headers) => {
    if (steadCanonicalAdapter.matches(headers)) return false;
    return (
      findHeaderIndex(headers, DATE_ALIASES) !== -1 &&
      findHeaderIndex(headers, DESCRIPTION_ALIASES) !== -1 &&
      headers.includes('debit') &&
      headers.includes('credit')
    );
  },
  toCanonicalCsv: (records) => {
    const headers = records[0].map(normalizeHeader);
    const dateIndex = findHeaderIndex(headers, DATE_ALIASES);
    const descriptionIndex = findHeaderIndex(headers, DESCRIPTION_ALIASES);
    const debitIndex = headers.indexOf('debit');
    const creditIndex = headers.indexOf('credit');

    const lines = ['date,description,amount,type'];
    for (const record of records.slice(1)) {
      const credit = record[creditIndex] ?? '';
      const debit = record[debitIndex] ?? '';
      const creditFilled = amountPresent(credit);
      const debitFilled = amountPresent(debit);

      let amount = '';
      let type = '';
      if (creditFilled && !debitFilled) {
        amount = credit.trim();
        type = 'credit';
      } else if (debitFilled && !creditFilled) {
        amount = debit.trim();
        type = 'debit';
      } else if (creditFilled && debitFilled) {
        // Leave blank so the canonical parser attaches a row-level error.
        amount = '';
        type = '';
      }

      lines.push(
        [
          toIsoDate(record[dateIndex] ?? ''),
          record[descriptionIndex] ?? '',
          amount,
          type,
        ]
          .map(csvEscape)
          .join(','),
      );
    }
    return lines.join('\n');
  },
};

export const transactionImportAdapters: TransactionImportAdapter[] = [
  steadCanonicalAdapter,
  provisionalDebitCreditAdapter,
];

export const toCanonicalImportCsv = (csv: string): string => {
  const records = parseCsvRecords(csv);
  if (records.length === 0) {
    throw new BadRequestException('CSV is empty');
  }

  const headers = records[0].map(normalizeHeader);
  const adapter = transactionImportAdapters.find((candidate) =>
    candidate.matches(headers),
  );
  if (!adapter) {
    throw new BadRequestException(
      `CSV must include these columns: ${CANONICAL_HEADERS.join(', ')}`,
    );
  }

  return adapter.toCanonicalCsv(records);
};

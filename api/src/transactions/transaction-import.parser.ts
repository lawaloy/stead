import { BadRequestException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type {
  TransactionDirection,
  TransactionImportRow,
} from '../contracts/generated/types.gen';
import { toCanonicalImportCsv } from './transaction-import.adapters';
import { parseCsvRecords } from './transaction-import.csv';

const REQUIRED_HEADERS = ['date', 'description', 'amount', 'type'] as const;
const MAX_ROWS = 500;

export type ParsedImportRow = TransactionImportRow & {
  occurredAt: string | null;
  direction: TransactionDirection | null;
  amountKobo: number | null;
  fingerprint: string | null;
};

const parseDate = (value: string) => {
  const normalized = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return null;
  const date = new Date(`${normalized}T12:00:00.000Z`);
  return Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== normalized
    ? null
    : date.toISOString();
};

const parseDirection = (value: string): TransactionDirection | null => {
  const normalized = value.trim().toLowerCase();
  if (['income', 'in', 'credit'].includes(normalized)) return 'in';
  if (['expense', 'out', 'debit'].includes(normalized)) return 'out';
  return null;
};

const parseAmountKobo = (value: string) => {
  const displayAmount = value.trim().replace(/^(?:NGN|₦)\s*/i, '');
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(displayAmount)) {
    return null;
  }
  const normalized = displayAmount.replace(/,/g, '');

  const [whole, fraction = ''] = normalized.split('.');
  const kobo = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  if (kobo <= 0n || kobo > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return Number(kobo);
};

export const parseTransactionImport = (csv: string): ParsedImportRow[] => {
  const canonicalCsv = toCanonicalImportCsv(csv);
  const records = parseCsvRecords(canonicalCsv);
  if (records.length === 0) {
    throw new BadRequestException('CSV is empty');
  }

  const headers = records[0].map((header, index) =>
    (index === 0 ? header.replace(/^\uFEFF/, '') : header).trim().toLowerCase(),
  );
  const duplicateHeaders = headers.filter(
    (header, index) => header && headers.indexOf(header) !== index,
  );
  if (duplicateHeaders.length > 0) {
    throw new BadRequestException('CSV contains duplicate column names');
  }

  const indexes = Object.fromEntries(
    REQUIRED_HEADERS.map((header) => [header, headers.indexOf(header)]),
  ) as Record<(typeof REQUIRED_HEADERS)[number], number>;
  const missing = REQUIRED_HEADERS.filter((header) => indexes[header] === -1);
  if (missing.length > 0) {
    throw new BadRequestException(
      `CSV must include these columns: ${REQUIRED_HEADERS.join(', ')}`,
    );
  }

  const dataRecords = records.slice(1);
  if (dataRecords.length === 0) {
    throw new BadRequestException('CSV has no transaction rows');
  }
  if (dataRecords.length > MAX_ROWS) {
    throw new BadRequestException(
      `CSV cannot contain more than ${MAX_ROWS} rows`,
    );
  }

  const occurrences = new Map<string, number>();
  return dataRecords.map((record, index) => {
    const occurredAt = parseDate(record[indexes.date] ?? '');
    const direction = parseDirection(record[indexes.type] ?? '');
    const amountKobo = parseAmountKobo(record[indexes.amount] ?? '');
    const note = (record[indexes.description] ?? '')
      .trim()
      .replace(/\s+/g, ' ');
    const errors: string[] = [];
    if (!occurredAt) errors.push('Date must use YYYY-MM-DD');
    if (!direction)
      errors.push('Type must be income, expense, credit, or debit');
    if (amountKobo === null)
      errors.push('Amount must be a positive naira value');
    if (!note) errors.push('Description is required');
    if (note.length > 280)
      errors.push('Description cannot exceed 280 characters');

    let fingerprint: string | null = null;
    if (errors.length === 0 && occurredAt && direction && amountKobo !== null) {
      const canonical = [
        occurredAt,
        direction,
        amountKobo,
        note.toLocaleLowerCase('en-NG'),
      ].join('|');
      const occurrence = (occurrences.get(canonical) ?? 0) + 1;
      occurrences.set(canonical, occurrence);
      fingerprint = createHash('sha256')
        .update(`${canonical}|${occurrence}`)
        .digest('hex');
    }

    return {
      rowNumber: index + 2,
      occurredAt,
      direction,
      amountKobo,
      note: note || null,
      fingerprint,
      duplicate: false,
      error: errors.length > 0 ? errors.join('; ') : null,
    };
  });
};

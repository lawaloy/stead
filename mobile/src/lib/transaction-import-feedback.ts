import { ApiError } from './api-error';

export const formatImportPreviewSummary = (input: {
  readyCount: number;
  duplicateCount: number;
  invalidCount: number;
}) => {
  const invalidLabel =
    input.invalidCount === 1 ? 'needs fixing' : 'need fixing';
  return `${input.readyCount} ready to import · ${input.duplicateCount} already imported · ${input.invalidCount} ${invalidLabel}`;
};

const readConfirmRowNumbers = (details: unknown): number[] => {
  if (!details || typeof details !== 'object') return [];
  const rowNumbers = (details as { rowNumbers?: unknown }).rowNumbers;
  if (!Array.isArray(rowNumbers)) return [];
  return rowNumbers.filter(
    (value): value is number =>
      typeof value === 'number' && Number.isFinite(value),
  );
};

export const formatConfirmImportError = (error: ApiError): string => {
  const rowNumbers = readConfirmRowNumbers(error.details);
  if (rowNumbers.length === 0) return error.message;

  const base = error.message.replace(/\.\s*$/, '');
  return `${base} (rows ${rowNumbers.join(', ')}).`;
};

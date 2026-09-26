import { ApiError } from '../lib/api-error';
import {
  formatConfirmImportError,
  formatImportPreviewSummary,
} from '../lib/transaction-import-feedback';

describe('transaction import feedback', () => {
  it('formats preview summary counts with singular and plural invalid labels', () => {
    expect(
      formatImportPreviewSummary({
        readyCount: 1,
        duplicateCount: 1,
        invalidCount: 1,
      }),
    ).toBe('1 ready to import · 1 already imported · 1 needs fixing');
    expect(
      formatImportPreviewSummary({
        readyCount: 2,
        duplicateCount: 0,
        invalidCount: 3,
      }),
    ).toBe('2 ready to import · 0 already imported · 3 need fixing');
  });

  it('appends confirm error row numbers from API details', () => {
    expect(
      formatConfirmImportError(
        new ApiError({
          message: 'Only valid rows from the current preview can be imported',
          details: { rowNumbers: [8, 2] },
        }),
      ),
    ).toBe(
      'Only valid rows from the current preview can be imported (rows 8, 2).',
    );
  });

  it('keeps the confirm message when row details are missing', () => {
    expect(
      formatConfirmImportError(
        new ApiError({
          message: 'Only valid rows from the current preview can be imported',
        }),
      ),
    ).toBe('Only valid rows from the current preview can be imported');
  });
});

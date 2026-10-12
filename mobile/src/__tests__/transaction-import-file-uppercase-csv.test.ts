import * as DocumentPicker from 'expo-document-picker';
import { File as ExpoFile } from 'expo-file-system';
import { pickTransactionCsv } from '../lib/transaction-import-file';

jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('expo-file-system', () => ({ File: jest.fn() }));

const mockPicker = jest.mocked(DocumentPicker.getDocumentAsync);
const mockFile = jest.mocked(ExpoFile);
const pickerResult = (value: unknown) =>
  value as DocumentPicker.DocumentPickerResult;

describe('pickTransactionCsv uppercase extension', () => {
  beforeEach(() => jest.clearAllMocks());

  it('accepts Windows-style STATEMENT.CSV exports after case-folding the extension', async () => {
    const text = jest.fn().mockResolvedValue('date,description,amount,type');
    mockPicker.mockResolvedValue(
      pickerResult({
        canceled: false,
        assets: [
          {
            name: 'STATEMENT.CSV',
            uri: 'file:///cache/STATEMENT.CSV',
            mimeType: 'text/csv',
            size: 28,
            file: { text } as unknown as File,
          },
        ],
      }),
    );

    await expect(pickTransactionCsv()).resolves.toEqual({
      name: 'STATEMENT.CSV',
      csv: 'date,description,amount,type',
    });
    expect(text).toHaveBeenCalledTimes(1);
    expect(mockFile).not.toHaveBeenCalled();
  });
});

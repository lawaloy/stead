import * as DocumentPicker from 'expo-document-picker';
import { pickTransactionCsv } from '../lib/transaction-import-file';

jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('expo-file-system', () => ({ File: jest.fn() }));

const mockPicker = jest.mocked(DocumentPicker.getDocumentAsync);
const pickerResult = (value: unknown) =>
  value as DocumentPicker.DocumentPickerResult;

describe('pickTransactionCsv extension case', () => {
  beforeEach(() => jest.clearAllMocks());

  it.each(['Statement.CSV', 'EXPORT.Csv'])(
    'accepts bank-export filename %s',
    async (name) => {
      const csv = 'date,description,amount,type';
      mockPicker.mockResolvedValue(
        pickerResult({
          canceled: false,
          assets: [
            {
              name,
              uri: `file:///cache/${name}`,
              mimeType: 'text/csv',
              file: { text: jest.fn().mockResolvedValue(csv) } as never,
            },
          ],
        }),
      );

      await expect(pickTransactionCsv()).resolves.toEqual({ name, csv });
    },
  );
});

import * as DocumentPicker from 'expo-document-picker';
import { File as ExpoFile } from 'expo-file-system';
import { pickTransactionCsv } from '../lib/transaction-import-file';

jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('expo-file-system', () => ({ File: jest.fn() }));

const mockPicker = jest.mocked(DocumentPicker.getDocumentAsync);
const mockFile = jest.mocked(ExpoFile);
const pickerResult = (value: unknown) =>
  value as DocumentPicker.DocumentPickerResult;

describe('pickTransactionCsv native read failure', () => {
  beforeEach(() => jest.clearAllMocks());

  it('surfaces an unreadable-file message when Expo File text() rejects', async () => {
    mockPicker.mockResolvedValue(
      pickerResult({
        canceled: false,
        assets: [
          {
            name: 'statement.csv',
            uri: 'file:///cache/statement.csv',
            mimeType: 'text/csv',
          },
        ],
      }),
    );
    mockFile.mockImplementation(
      () =>
        ({
          text: jest.fn().mockRejectedValue(new Error('native I/O error')),
        }) as never,
    );

    await expect(pickTransactionCsv()).rejects.toThrow(
      'Unable to read that CSV file. Close other apps using it, or export the statement again.',
    );
    expect(mockFile).toHaveBeenCalledWith('file:///cache/statement.csv');
  });
});

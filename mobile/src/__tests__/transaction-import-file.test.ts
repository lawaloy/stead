import * as DocumentPicker from 'expo-document-picker';
import { File as ExpoFile } from 'expo-file-system';
import { pickTransactionCsv } from '../lib/transaction-import-file';

jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('expo-file-system', () => ({ File: jest.fn() }));

const mockPicker = jest.mocked(DocumentPicker.getDocumentAsync);
const mockFile = jest.mocked(ExpoFile);
const pickerResult = (value: unknown) =>
  value as DocumentPicker.DocumentPickerResult;

describe('pickTransactionCsv', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns null when the native picker is cancelled', async () => {
    mockPicker.mockResolvedValue(
      pickerResult({ canceled: true, assets: null }),
    );
    await expect(pickTransactionCsv()).resolves.toBeNull();
  });

  it('reads a web-selected CSV directly from its File object', async () => {
    const text = jest.fn().mockResolvedValue('date,description,amount,type');
    mockPicker.mockResolvedValue(
      pickerResult({
        canceled: false,
        assets: [
          {
            name: 'statement.csv',
            uri: 'blob:statement',
            mimeType: 'text/csv',
            size: 28,
            file: { text } as unknown as File,
          },
        ],
      }),
    );

    await expect(pickTransactionCsv()).resolves.toEqual({
      name: 'statement.csv',
      csv: 'date,description,amount,type',
    });
    expect(text).toHaveBeenCalledTimes(1);
    expect(mockFile).not.toHaveBeenCalled();
  });

  it('copies and reads native content through Expo FileSystem', async () => {
    const text = jest.fn().mockResolvedValue('date,description,amount,type');
    mockPicker.mockResolvedValue(
      pickerResult({
        canceled: false,
        assets: [
          {
            name: 'statement.csv',
            uri: 'file:///cache/statement.csv',
            mimeType: 'text/csv',
            size: 28,
          },
        ],
      }),
    );
    mockFile.mockImplementation(() => ({ text }) as never);

    await expect(pickTransactionCsv()).resolves.toMatchObject({
      name: 'statement.csv',
    });
    expect(mockFile).toHaveBeenCalledWith('file:///cache/statement.csv');
    expect(text).toHaveBeenCalledTimes(1);
  });

  it.each([
    [
      'statement.pdf',
      20,
      'content',
      'Choose a file with a .csv extension.',
    ],
    [
      'statement.csv',
      0,
      '   ',
      'That CSV file is empty. Export a statement that includes at least one transaction row, then try again.',
    ],
  ])('rejects unsafe file %s', async (name, size, contents, message) => {
    mockPicker.mockResolvedValue(
      pickerResult({
        canceled: false,
        assets: [
          {
            name,
            uri: `file:///cache/${name}`,
            mimeType: 'text/plain',
            size,
            file: { text: jest.fn().mockResolvedValue(contents) } as never,
          },
        ],
      }),
    );

    await expect(pickTransactionCsv()).rejects.toThrow(message);
  });

  it('checks the decoded character limit when picker size metadata is unavailable', async () => {
    mockPicker.mockResolvedValue(
      pickerResult({
        canceled: false,
        assets: [
          {
            name: 'statement.csv',
            uri: 'file:///cache/statement.csv',
            mimeType: 'text/csv',
            file: {
              text: jest.fn().mockResolvedValue('é'.repeat(200_001)),
            } as never,
          },
        ],
      }),
    );

    await expect(pickTransactionCsv()).rejects.toThrow(
      'That CSV is too large (over 200,000 characters). Export a smaller date range, then try again.',
    );
  });

  it('accepts contract-sized multibyte content regardless of encoded byte size', async () => {
    const csv = '\u00e9'.repeat(200_000);
    mockPicker.mockResolvedValue(
      pickerResult({
        canceled: false,
        assets: [
          {
            name: 'statement.csv',
            uri: 'file:///cache/statement.csv',
            mimeType: 'text/csv',
            size: 400_000,
            file: { text: jest.fn().mockResolvedValue(csv) } as never,
          },
        ],
      }),
    );

    await expect(pickTransactionCsv()).resolves.toEqual({
      name: 'statement.csv',
      csv,
    });
  });

  it('surfaces read failures with a clearer unreadable-file message', async () => {
    mockPicker.mockResolvedValue(
      pickerResult({
        canceled: false,
        assets: [
          {
            name: 'statement.csv',
            uri: 'file:///cache/statement.csv',
            mimeType: 'text/csv',
            file: {
              text: jest.fn().mockRejectedValue(new Error('I/O error')),
            } as never,
          },
        ],
      }),
    );

    await expect(pickTransactionCsv()).rejects.toThrow(
      'Unable to read that CSV file. Close other apps using it, or export the statement again.',
    );
  });
});

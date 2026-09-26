import * as DocumentPicker from 'expo-document-picker';
import { File as ExpoFile } from 'expo-file-system';

const MAX_CSV_CHARACTERS = 200_000;

export const TRANSACTION_IMPORT_NOT_CSV =
  'Choose a file with a .csv extension.';

export const TRANSACTION_IMPORT_EMPTY_FILE =
  'That CSV file is empty. Export a statement that includes at least one transaction row, then try again.';

export const TRANSACTION_IMPORT_TOO_LARGE =
  'That CSV is too large (over 200,000 characters). Export a smaller date range, then try again.';

export const TRANSACTION_IMPORT_UNREADABLE =
  'Unable to read that CSV file. Close other apps using it, or export the statement again.';

export type PickedTransactionCsv = {
  name: string;
  csv: string;
};

const readCsvText = async (asset: DocumentPicker.DocumentPickerAsset) => {
  try {
    if (asset.file) return await asset.file.text();
    return await new ExpoFile(asset.uri).text();
  } catch {
    throw new Error(TRANSACTION_IMPORT_UNREADABLE);
  }
};

export const pickTransactionCsv =
  async (): Promise<PickedTransactionCsv | null> => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['text/csv', 'text/comma-separated-values', 'text/plain'],
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled) return null;

    const asset = result.assets[0];
    if (!asset.name.toLowerCase().endsWith('.csv')) {
      throw new Error(TRANSACTION_IMPORT_NOT_CSV);
    }

    const csv = await readCsvText(asset);
    if (!csv.trim()) throw new Error(TRANSACTION_IMPORT_EMPTY_FILE);
    if (csv.length > MAX_CSV_CHARACTERS) {
      throw new Error(TRANSACTION_IMPORT_TOO_LARGE);
    }

    return { name: asset.name, csv };
  };

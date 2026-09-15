import * as DocumentPicker from 'expo-document-picker';
import { File as ExpoFile } from 'expo-file-system';

const MAX_CSV_CHARACTERS = 200_000;

export type PickedTransactionCsv = {
  name: string;
  csv: string;
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
      throw new Error('Choose a file with a .csv extension.');
    }
    const csv = asset.file
      ? await asset.file.text()
      : await new ExpoFile(asset.uri).text();
    if (!csv.trim()) throw new Error('The selected CSV file is empty.');
    if (csv.length > MAX_CSV_CHARACTERS) {
      throw new Error('The CSV file must be 200,000 characters or fewer.');
    }

    return { name: asset.name, csv };
  };

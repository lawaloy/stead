import { readFileSync } from 'node:fs';
import { join } from 'node:path';

type ImageSizeResult = {
  height?: number;
  type?: string;
  width?: number;
};

type ImageSize = (input: Uint8Array | string) => ImageSizeResult;

// eslint-disable-next-line @typescript-eslint/no-require-imports
const imageSize = require('../../vendor/image-size-compat') as ImageSize;

describe('Metro image-size compatibility boundary', () => {
  const iconPath = join(__dirname, '..', '..', 'assets', 'icon.png');

  it('reads the same metadata from a file path and an in-memory asset', () => {
    const fromPath = imageSize(iconPath);
    const fromBuffer = imageSize(readFileSync(iconPath));

    expect(fromPath).toMatchObject({
      height: expect.any(Number),
      type: 'png',
      width: expect.any(Number),
    });
    expect(fromBuffer).toEqual(fromPath);
  });

  it('rejects a zero-length ICNS entry before invoking an image parser', () => {
    const maliciousIcns = Uint8Array.from([
      0x69,
      0x63,
      0x6e,
      0x73, // icns
      0x00,
      0x00,
      0x00,
      0x10, // file length
      0x69,
      0x63,
      0x30,
      0x37, // ic07
      0x00,
      0x00,
      0x00,
      0x00, // zero-length entry
    ]);

    expect(() => imageSize(maliciousIcns)).toThrow(
      'unsupported file type: icns',
    );
  });
});

import { BadRequestException } from '@nestjs/common';
import { createHmac } from 'node:crypto';

const DEVICE_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function hashDeviceIdentifier(
  deviceId: string | undefined,
  secret: string | undefined,
): string | undefined {
  if (!deviceId) return undefined;

  if (!DEVICE_ID_PATTERN.test(deviceId)) {
    throw new BadRequestException(
      'X-Stead-Device-Id must be a valid UUIDv4 identifier',
    );
  }

  if (!secret) {
    throw new Error('Auth device identifier secret is not configured');
  }

  return createHmac('sha256', secret)
    .update(deviceId.toLowerCase(), 'utf8')
    .digest('hex');
}

export function getDeviceReference(deviceHash: string | null | undefined) {
  return deviceHash ? `device_${deviceHash.slice(0, 16)}` : null;
}

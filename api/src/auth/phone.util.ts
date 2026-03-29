import { BadRequestException } from '@nestjs/common';

const E164_REGEX = /^\+[1-9]\d{9,14}$/;

export function normalizePhoneNumber(phone: string): string {
  const compact = phone.replace(/[\s\-().]/g, '');

  let normalized = compact;
  if (normalized.startsWith('00')) {
    normalized = `+${normalized.slice(2)}`;
  } else if (/^0\d{10}$/.test(normalized)) {
    normalized = `+234${normalized.slice(1)}`;
  } else if (/^\d{10,15}$/.test(normalized)) {
    normalized = `+${normalized}`;
  }

  if (!E164_REGEX.test(normalized)) {
    throw new BadRequestException('phone must look like +2348012345678');
  }

  return normalized;
}

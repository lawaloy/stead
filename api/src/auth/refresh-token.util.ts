import { createHash, randomBytes, randomUUID } from 'node:crypto';

const DURATION_PATTERN = /^(\d+)([smhd])$/i;

export const hashRefreshToken = (token: string) =>
  createHash('sha256').update(token, 'utf8').digest('hex');

export const generateRefreshToken = () => randomBytes(32).toString('base64url');

export const generateRefreshFamilyId = () => randomUUID();

/** Parse durations like 15m, 30d, 7d into milliseconds. */
export const parseDurationToMs = (value: string): number => {
  const match = value.trim().match(DURATION_PATTERN);
  if (!match) {
    throw new Error(`Unsupported duration: ${value}`);
  }
  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  const multipliers: Record<string, number> = {
    s: 1_000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  };
  return amount * multipliers[unit];
};

export const parseDurationToSeconds = (value: string): number =>
  Math.floor(parseDurationToMs(value) / 1_000);

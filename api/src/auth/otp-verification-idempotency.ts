import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import type { VerifyOtpResponse } from '../contracts/generated/types.gen';

const ENVELOPE_VERSION = 1;
const IV_BYTES = 12;

type EncryptedEnvelope = {
  v: typeof ENVELOPE_VERSION;
  iv: string;
  tag: string;
  ciphertext: string;
};

const deriveKey = (secret: string, purpose: string) =>
  createHmac('sha256', secret)
    .update(`stead:otp-verification:${purpose}:v1`)
    .digest();

const associatedData = (keyHash: string, requestHash: string) =>
  Buffer.from(`${keyHash}:${requestHash}`, 'utf8');

export const hashOtpVerificationKey = (idempotencyKey: string) =>
  createHash('sha256').update(idempotencyKey).digest('hex');

export const hashOtpVerificationRequest = (
  secret: string,
  input: {
    deviceHash?: string | null;
  },
) =>
  createHmac('sha256', deriveKey(secret, 'request-fingerprint'))
    .update(JSON.stringify([input.deviceHash ?? null]))
    .digest('hex');

export const otpVerificationRequestMatches = (
  storedHash: string,
  candidateHash: string,
) => {
  const stored = Buffer.from(storedHash, 'hex');
  const candidate = Buffer.from(candidateHash, 'hex');
  return (
    stored.length === candidate.length && timingSafeEqual(stored, candidate)
  );
};

export const encryptOtpVerificationResponse = (
  secret: string,
  keyHash: string,
  requestHash: string,
  response: VerifyOtpResponse,
) => {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(
    'aes-256-gcm',
    deriveKey(secret, 'response-encryption'),
    iv,
  );
  cipher.setAAD(associatedData(keyHash, requestHash));
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(response), 'utf8'),
    cipher.final(),
  ]);
  const envelope: EncryptedEnvelope = {
    v: ENVELOPE_VERSION,
    iv: iv.toString('base64url'),
    tag: cipher.getAuthTag().toString('base64url'),
    ciphertext: ciphertext.toString('base64url'),
  };
  return JSON.stringify(envelope);
};

export const decryptOtpVerificationResponse = (
  secret: string,
  keyHash: string,
  requestHash: string,
  value: string,
): VerifyOtpResponse => {
  try {
    const envelope = JSON.parse(value) as Partial<EncryptedEnvelope>;
    if (
      envelope.v !== ENVELOPE_VERSION ||
      typeof envelope.iv !== 'string' ||
      typeof envelope.tag !== 'string' ||
      typeof envelope.ciphertext !== 'string'
    ) {
      throw new Error('Invalid envelope');
    }
    const decipher = createDecipheriv(
      'aes-256-gcm',
      deriveKey(secret, 'response-encryption'),
      Buffer.from(envelope.iv, 'base64url'),
    );
    decipher.setAAD(associatedData(keyHash, requestHash));
    decipher.setAuthTag(Buffer.from(envelope.tag, 'base64url'));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(envelope.ciphertext, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
    const response = JSON.parse(plaintext) as Partial<VerifyOtpResponse>;
    if (
      typeof response.token !== 'string' ||
      typeof response.refreshToken !== 'string' ||
      !Number.isSafeInteger(response.expiresIn) ||
      Number(response.expiresIn) <= 0
    ) {
      throw new Error('Invalid response');
    }
    return response as VerifyOtpResponse;
  } catch {
    throw new Error('Unable to decrypt OTP verification response');
  }
};

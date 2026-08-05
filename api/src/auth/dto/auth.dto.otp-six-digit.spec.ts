import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { VerifyOtpDto } from './verify-otp.dto';

async function validationErrors(payload: Record<string, unknown>) {
  return validate(plainToInstance(VerifyOtpDto, payload));
}

describe('VerifyOtpDto six-digit OTP contract', () => {
  const base = {
    countryIso: 'NG',
    phone: '+2348012345678',
  };

  it('accepts exactly six digits matching generator and mobile clients', async () => {
    await expect(
      validationErrors({ ...base, otp: '123456' }),
    ).resolves.toHaveLength(0);
    await expect(
      validationErrors({ ...base, otp: '000001' }),
    ).resolves.toHaveLength(0);
  });

  it('rejects non-digit and wrong-length OTP values', async () => {
    const cases = ['12345', '1234567', '12ab56', 'abcdef', '1234', '12345678'];
    for (const otp of cases) {
      const errors = await validationErrors({ ...base, otp });
      expect(errors.some((e) => e.property === 'otp')).toBe(true);
    }
  });
});

import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RequestOtpDto } from './request-otp.dto';
import { VerifyOtpDto } from './verify-otp.dto';

async function validationErrors(
  Dto: new () => object,
  payload: Record<string, unknown>,
) {
  const instance = plainToInstance(Dto, payload);
  return validate(instance);
}

describe('Auth DTOs', () => {
  describe('RequestOtpDto', () => {
    it('accepts uppercase country ISO and E.164 / local / 00 phone forms', async () => {
      await expect(
        validationErrors(RequestOtpDto, {
          countryIso: 'NG',
          phone: '+2348012345678',
        }),
      ).resolves.toHaveLength(0);
      await expect(
        validationErrors(RequestOtpDto, {
          countryIso: 'GB',
          phone: '08012345678',
        }),
      ).resolves.toHaveLength(0);
      await expect(
        validationErrors(RequestOtpDto, {
          countryIso: 'US',
          phone: '0015551234567',
        }),
      ).resolves.toHaveLength(0);
    });

    it('rejects lowercase countryIso before service normalization', async () => {
      const errors = await validationErrors(RequestOtpDto, {
        countryIso: 'ng',
        phone: '+2348012345678',
      });
      expect(errors.some((e) => e.property === 'countryIso')).toBe(true);
    });

    it('rejects phones that are too short', async () => {
      const errors = await validationErrors(RequestOtpDto, {
        countryIso: 'NG',
        phone: '123',
      });
      expect(errors.some((e) => e.property === 'phone')).toBe(true);
    });
  });

  describe('VerifyOtpDto', () => {
    it('accepts a 6-digit OTP code', async () => {
      await expect(
        validationErrors(VerifyOtpDto, {
          countryIso: 'NG',
          phone: '+2348012345678',
          otp: '123456',
        }),
      ).resolves.toHaveLength(0);
    });

    it('rejects OTP codes that are not exactly 6 digits', async () => {
      const tooShort = await validationErrors(VerifyOtpDto, {
        countryIso: 'NG',
        phone: '+2348012345678',
        otp: '12',
      });
      const tooLong = await validationErrors(VerifyOtpDto, {
        countryIso: 'NG',
        phone: '+2348012345678',
        otp: '123456789',
      });
      expect(tooShort.some((e) => e.property === 'otp')).toBe(true);
      expect(tooLong.some((e) => e.property === 'otp')).toBe(true);
    });
  });
});

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

describe('Auth DTO edges', () => {
  describe('VerifyOtpDto', () => {
    it('rejects lowercase countryIso before service normalization', async () => {
      const errors = await validationErrors(VerifyOtpDto, {
        countryIso: 'ng',
        phone: '+2348012345678',
        otp: '123456',
      });
      expect(errors.some((e) => e.property === 'countryIso')).toBe(true);
    });

    it('rejects missing required fields', async () => {
      const errors = await validationErrors(VerifyOtpDto, {});
      expect(errors.some((e) => e.property === 'countryIso')).toBe(true);
      expect(errors.some((e) => e.property === 'phone')).toBe(true);
      expect(errors.some((e) => e.property === 'otp')).toBe(true);
    });

    it('rejects phones longer than 15 digits', async () => {
      const errors = await validationErrors(VerifyOtpDto, {
        countryIso: 'NG',
        phone: '+23480123456789012',
        otp: '123456',
      });
      expect(errors.some((e) => e.property === 'phone')).toBe(true);
    });
  });

  describe('RequestOtpDto', () => {
    it('rejects missing required fields', async () => {
      const errors = await validationErrors(RequestOtpDto, {});
      expect(errors.some((e) => e.property === 'countryIso')).toBe(true);
      expect(errors.some((e) => e.property === 'phone')).toBe(true);
    });

    it('rejects phones longer than 15 digits', async () => {
      const errors = await validationErrors(RequestOtpDto, {
        countryIso: 'NG',
        phone: '+23480123456789012',
      });
      expect(errors.some((e) => e.property === 'phone')).toBe(true);
    });
  });
});

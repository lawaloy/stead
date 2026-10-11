import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { LogoutSessionDto } from './logout-session.dto';
import { RefreshSessionDto } from './refresh-session.dto';

async function validationErrors(
  Dto: new () => object,
  payload: Record<string, unknown>,
) {
  return validate(plainToInstance(Dto, payload));
}

describe('Auth session DTOs', () => {
  describe('RefreshSessionDto', () => {
    it('accepts a non-empty refresh token', async () => {
      await expect(
        validationErrors(RefreshSessionDto, { refreshToken: 'live-refresh' }),
      ).resolves.toHaveLength(0);
    });

    it('rejects a missing or blank refresh token', async () => {
      const missing = await validationErrors(RefreshSessionDto, {});
      const blank = await validationErrors(RefreshSessionDto, {
        refreshToken: '',
      });

      expect(missing.some((error) => error.property === 'refreshToken')).toBe(
        true,
      );
      expect(blank.some((error) => error.property === 'refreshToken')).toBe(
        true,
      );
    });
  });

  describe('LogoutSessionDto', () => {
    it('accepts an empty body and optional live credentials', async () => {
      await expect(
        validationErrors(LogoutSessionDto, {}),
      ).resolves.toHaveLength(0);
      await expect(
        validationErrors(LogoutSessionDto, {
          refreshToken: 'live-refresh',
          allDevices: true,
        }),
      ).resolves.toHaveLength(0);
    });

    it('rejects a blank refresh token and a non-boolean allDevices flag', async () => {
      const blank = await validationErrors(LogoutSessionDto, {
        refreshToken: '',
      });
      const flag = await validationErrors(LogoutSessionDto, {
        allDevices: 'true',
      });

      expect(blank.some((error) => error.property === 'refreshToken')).toBe(
        true,
      );
      expect(flag.some((error) => error.property === 'allDevices')).toBe(true);
    });
  });
});

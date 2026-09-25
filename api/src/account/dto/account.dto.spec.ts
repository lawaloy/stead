import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { DeleteAccountDto } from './delete-account.dto';
import { UpdateConsentsDto } from './update-consents.dto';
import { UpdateProfileDto } from './update-profile.dto';

async function validationErrors(
  Dto: new () => object,
  payload: Record<string, unknown>,
) {
  const instance = plainToInstance(Dto, payload, {
    enableImplicitConversion: true,
  });
  return validate(instance);
}

describe('Account DTOs', () => {
  describe('DeleteAccountDto', () => {
    it('accepts only the exact DELETE confirmation token', async () => {
      await expect(
        validationErrors(DeleteAccountDto, { confirmation: 'DELETE' }),
      ).resolves.toHaveLength(0);
    });

    it('rejects lowercase, padded, or missing confirmation tokens', async () => {
      const lowercase = await validationErrors(DeleteAccountDto, {
        confirmation: 'delete',
      });
      const padded = await validationErrors(DeleteAccountDto, {
        confirmation: 'DELETE ',
      });
      const missing = await validationErrors(DeleteAccountDto, {});

      expect(lowercase.some((error) => error.property === 'confirmation')).toBe(
        true,
      );
      expect(padded.some((error) => error.property === 'confirmation')).toBe(
        true,
      );
      expect(missing.some((error) => error.property === 'confirmation')).toBe(
        true,
      );
    });
  });

  describe('UpdateProfileDto', () => {
    it('accepts an explicit null display name so the client can clear it', async () => {
      await expect(
        validationErrors(UpdateProfileDto, { displayName: null }),
      ).resolves.toHaveLength(0);
    });

    it('rejects blank or oversized display names before they reach the service', async () => {
      const blank = await validationErrors(UpdateProfileDto, {
        displayName: '',
      });
      const oversized = await validationErrors(UpdateProfileDto, {
        displayName: 'n'.repeat(101),
      });

      expect(blank.some((error) => error.property === 'displayName')).toBe(
        true,
      );
      expect(oversized.some((error) => error.property === 'displayName')).toBe(
        true,
      );
    });
  });

  describe('UpdateConsentsDto', () => {
    it('accepts boolean consent patches and rejects non-boolean values', async () => {
      await expect(
        validationErrors(UpdateConsentsDto, { analyticsEnabled: false }),
      ).resolves.toHaveLength(0);

      const instance = plainToInstance(UpdateConsentsDto, {
        analyticsEnabled: 'yes',
      });
      const coerced = await validate(instance);
      expect(
        coerced.some((error) => error.property === 'analyticsEnabled'),
      ).toBe(true);
    });
  });
});

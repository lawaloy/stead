import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateAlertPreferencesDto } from './update-alert-preferences.dto';

async function validationErrors(payload: Record<string, unknown>) {
  const instance = plainToInstance(UpdateAlertPreferencesDto, payload, {
    enableImplicitConversion: true,
  });
  return validate(instance);
}

describe('UpdateAlertPreferencesDto', () => {
  it('accepts Sunday and midnight schedule bounds', async () => {
    await expect(
      validationErrors({
        weeklyDay: 0,
        weeklyHourLocal: 0,
        timeZone: 'Africa/Lagos',
      }),
    ).resolves.toHaveLength(0);
    await expect(
      validationErrors({
        weeklyDay: 6,
        weeklyHourLocal: 23,
        timeZone: 'Europe/London',
      }),
    ).resolves.toHaveLength(0);
  });

  it('rejects out-of-range schedule values and a blank timezone', async () => {
    const day = await validationErrors({ weeklyDay: 7 });
    const hour = await validationErrors({ weeklyHourLocal: 24 });
    const blankZone = await validationErrors({ timeZone: '' });

    expect(day.some((error) => error.property === 'weeklyDay')).toBe(true);
    expect(hour.some((error) => error.property === 'weeklyHourLocal')).toBe(
      true,
    );
    expect(blankZone.some((error) => error.property === 'timeZone')).toBe(true);
  });
});

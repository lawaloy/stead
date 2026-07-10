import { CountriesService } from './countries.service';
import { PrismaService } from '../prisma/prisma.service';

describe('CountriesService', () => {
  let service: CountriesService;
  let prisma: {
    country: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
    };
  };

  beforeEach(() => {
    prisma = {
      country: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
      },
    };

    service = new CountriesService(prisma as unknown as PrismaService);
  });

  it('returns auth-enabled countries ordered for the mobile selector', async () => {
    prisma.country.findMany.mockResolvedValue([
      {
        isoCode: 'NG',
        name: 'Nigeria',
        dialCode: '+234',
        currencyCode: 'NGN',
        phoneExample: '08012345678',
        authEnabled: true,
        marketEnabled: true,
        defaultCountry: true,
      },
    ]);

    await expect(service.listAuthCountries()).resolves.toEqual([
      {
        iso: 'NG',
        label: 'Nigeria',
        dialCode: '+234',
        currencyCode: 'NGN',
        phoneExample: '08012345678',
        authEnabled: true,
        marketEnabled: true,
        defaultCountry: true,
      },
    ]);
    expect(prisma.country.findMany).toHaveBeenCalledWith({
      where: { authEnabled: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  });

  it('requires a selected country to be auth-enabled', async () => {
    prisma.country.findFirst.mockResolvedValue(null);

    await expect(service.requireAuthCountry('ZZ')).rejects.toMatchObject({
      message: 'countryIso must be supported',
    });
    expect(prisma.country.findFirst).toHaveBeenCalledWith({
      where: { isoCode: 'ZZ', authEnabled: true },
    });
  });

  it('normalizes selected country codes to uppercase before lookup', async () => {
    prisma.country.findFirst.mockResolvedValue({
      isoCode: 'NG',
      name: 'Nigeria',
      dialCode: '+234',
      currencyCode: 'NGN',
      phoneExample: '08012345678',
      authEnabled: true,
      marketEnabled: true,
      defaultCountry: true,
    });

    await expect(service.requireAuthCountry('ng')).resolves.toEqual({
      iso: 'NG',
      label: 'Nigeria',
      dialCode: '+234',
      currencyCode: 'NGN',
      phoneExample: '08012345678',
      authEnabled: true,
      marketEnabled: true,
      defaultCountry: true,
    });
    expect(prisma.country.findFirst).toHaveBeenCalledWith({
      where: { isoCode: 'NG', authEnabled: true },
    });
  });
});

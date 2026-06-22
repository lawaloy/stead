import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthCountryDto } from './countries.types';

type CountryRecord = {
  isoCode: string;
  name: string;
  dialCode: string;
  currencyCode: string;
  phoneExample: string;
  authEnabled: boolean;
  marketEnabled: boolean;
  defaultCountry: boolean;
};

@Injectable()
export class CountriesService {
  constructor(private prisma: PrismaService) {}

  async listAuthCountries(): Promise<AuthCountryDto[]> {
    const countries = (await this.prisma.country.findMany({
      where: { authEnabled: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    })) as CountryRecord[];

    return countries.map((country) => this.toAuthCountryDto(country));
  }

  async requireAuthCountry(isoCode: string): Promise<AuthCountryDto> {
    const normalizedIsoCode = isoCode.toUpperCase();
    const country = (await this.prisma.country.findFirst({
      where: { isoCode: normalizedIsoCode, authEnabled: true },
    })) as CountryRecord | null;

    if (!country) {
      throw new BadRequestException('countryIso must be supported');
    }

    return this.toAuthCountryDto(country);
  }

  private toAuthCountryDto(country: CountryRecord): AuthCountryDto {
    return {
      iso: country.isoCode,
      label: country.name,
      dialCode: country.dialCode,
      currencyCode: country.currencyCode,
      phoneExample: country.phoneExample,
      authEnabled: country.authEnabled,
      marketEnabled: country.marketEnabled,
      defaultCountry: country.defaultCountry,
    };
  }
}

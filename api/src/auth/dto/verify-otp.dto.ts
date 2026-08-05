import { IsString, Matches } from 'class-validator';

export class VerifyOtpDto {
  @IsString()
  @Matches(/^[A-Z]{2}$/, {
    message: 'countryIso must be a two-letter country code',
  })
  countryIso!: string;

  @IsString()
  @Matches(/^(?:\+?\d{6,15}|0\d{6,14}|00\d{6,15})$/, {
    message: 'phone must look like +2348012345678',
  })
  phone!: string;

  @IsString()
  @Matches(/^\d{6}$/, {
    message: 'otp must be a 6-digit code',
  })
  otp!: string;
}

import { IsString, Length, Matches } from 'class-validator';

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
  @Length(4, 8)
  otp!: string;
}

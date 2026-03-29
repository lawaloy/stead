import { IsIn, IsString, Matches } from 'class-validator';

export class RequestOtpDto {
  @IsString()
  @IsIn(['NG', 'US', 'GB'])
  countryIso!: 'NG' | 'US' | 'GB';

  @IsString()
  @Matches(/^(?:\+?\d{6,15}|0\d{6,14}|00\d{6,15})$/, {
    message: 'phone must look like +2348012345678',
  })
  phone!: string;
}

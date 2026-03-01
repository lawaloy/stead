import { IsString, Length, Matches } from 'class-validator';

export class VerifyOtpDto {
  @IsString()
  @Matches(/^\+?\d{10,15}$/, { message: 'phone must look like +2348012345678' })
  phone!: string;

  @IsString()
  @Length(4, 8)
  otp!: string;
}
